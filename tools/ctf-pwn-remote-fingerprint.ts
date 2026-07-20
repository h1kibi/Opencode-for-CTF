import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

const DEFAULT_FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g
const PTR_RE = /0x[0-9a-fA-F]{6,16}/g

function compact(s: string, max = 12000) {
  const clean = String(s || "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  return `${clean.slice(0, Math.floor(max * 0.6))}\n...[truncated ${clean.length - max} chars]...\n${clean.slice(clean.length - Math.floor(max * 0.4))}`
}

function splitLines(text: string, max = 12) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter(Boolean)
    .slice(0, max)
}

function classifyClosure(text: string) {
  const lower = text.toLowerCase()
  if (/connection closed|got eof while/i.test(lower)) return "eof"
  if (/timeout|timed out/i.test(lower)) return "timeout"
  if (/refused|reset by peer|broken pipe/i.test(lower)) return "connection_error"
  return "open_or_unknown"
}

function leakShape(text: string) {
  const ptrs = Array.from(new Set(String(text || "").match(PTR_RE) || []))
  const lengths = ptrs.map((p) => p.length)
  return {
    pointer_count: ptrs.length,
    sample_pointers: ptrs.slice(0, 8),
    looks_like_leak: ptrs.length > 0,
    common_pointer_width: lengths.length
      ? Math.max(
          ...Array.from(new Set(lengths))
            .map((n) => [n, lengths.filter((x) => x === n).length] as const)
            .sort((a, b) => b[1] - a[1])
            .map((x) => x[0]),
        )
      : 0,
  }
}

function diffSummary(a: string, b: string) {
  const al = splitLines(a, 20)
  const bl = splitLines(b, 20)
  return {
    same_prefix_lines: al.filter((x, i) => bl[i] === x).length,
    baseline_only: al.filter((x) => !bl.includes(x)).slice(0, 8),
    mutant_only: bl.filter((x) => !al.includes(x)).slice(0, 8),
  }
}

function classifyTransport(text: string) {
  const lower = text.toLowerCase()
  if (/choice|menu|select|add|edit|delete|show|name|password|size|length|> |: /.test(lower)) return "line-based"
  if (/\x00|�/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return "tcp/raw"
  return "tcp/raw"
}

function binaryProtocolLikely(text: string) {
  return /\x00|�/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
}

function restartLikely(a: string, b: string) {
  const text = `${a}\n${b}`.toLowerCase()
  return /new connection|forking|child process|session id|pid |process id|welcome back/.test(text)
}

export default tool({
  description:
    "CTF PWN remote fingerprint: low-noise baseline vs mutant remote probe for banner, initial output, EOF behavior, and leak-shape comparison.",
  args: {
    host: tool.schema.string().describe("Remote host."),
    port: tool.schema.number().describe("Remote port."),
    baselinePayloadText: tool.schema.string().optional().describe("Optional baseline payload text."),
    baselinePayloadHex: tool.schema.string().optional().describe("Optional baseline payload hex."),
    mutantPayloadText: tool.schema.string().optional().describe("Optional mutant payload text."),
    mutantPayloadHex: tool.schema.string().optional().describe("Optional mutant payload hex."),
    baselineLine: tool.schema.boolean().optional().describe("Send baseline with sendline. Default true."),
    mutantLine: tool.schema.boolean().optional().describe("Send mutant with sendline. Default true."),
    baselineExpect: tool.schema.string().optional().describe("Optional pattern to recvuntil before baseline send."),
    mutantExpect: tool.schema.string().optional().describe("Optional pattern to recvuntil before mutant send."),
    timeoutMs: tool.schema.number().optional().describe("Total timeout in ms. Default 10000."),
    preReadMs: tool.schema.number().optional().describe("Initial banner read window in ms. Default 600."),
    postReadMs: tool.schema.number().optional().describe("Post-send read window in ms. Default 1200."),
    flagPattern: tool.schema.string().optional().describe("Optional flag regex source."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 10000, 30000))
    const preReadMs = Math.max(100, Math.min(args.preReadMs ?? 600, 5000))
    const postReadMs = Math.max(100, Math.min(args.postReadMs ?? 1200, 8000))
    const baselineLine = args.baselineLine !== false
    const mutantLine = args.mutantLine !== false
    const driverDir = await mkdir(path.join(os.tmpdir(), `pwn-remote-fingerprint-${randomUUID().slice(0, 12)}`), {
      recursive: true,
    })
      .then(() => path.join(os.tmpdir(), `pwn-remote-fingerprint-${randomUUID().slice(0, 12)}`))
      .catch(() => path.join(os.tmpdir(), `pwn-remote-fingerprint-fallback-${randomUUID().slice(0, 12)}`))
    await mkdir(driverDir, { recursive: true })
    const driver = path.join(driverDir, "remote_fp.py")
    const script = `#!/usr/bin/env python3
from pwn import *
import json, re, sys, time

HOST = ${JSON.stringify(String(args.host))}
PORT = ${Number(args.port)}
TIMEOUT = ${Math.floor(timeoutMs / 1000)}
PRE = ${preReadMs / 1000}
POST = ${postReadMs / 1000}
FLAG_RE = re.compile(${JSON.stringify(args.flagPattern || DEFAULT_FLAG_RE.source)})

def to_bytes(text, hx):
    if hx:
        return bytes.fromhex(''.join(ch for ch in hx if ch in '0123456789abcdefABCDEF'))
    if text is None:
        return None
    return str(text).encode('latin1', errors='ignore')

def run_case(name, payload_text, payload_hex, line_mode, expect):
    out = {'name': name, 'banner': '', 'expect_data': '', 'send_size': 0, 'body': '', 'status': 'ok', 'error': ''}
    r = None
    try:
        try:
            r = remote(HOST, PORT, timeout=TIMEOUT)
        except Exception as e:
            out['status'] = 'connection_error'
            out['error'] = str(e)
            blob = out['banner'] + out['expect_data'] + out['body'] + out['error']
            out['flags'] = list(dict.fromkeys(FLAG_RE.findall(blob)))
            print(json.dumps(out, ensure_ascii=False))
            return
        try:
            out['banner'] = r.recvrepeat(PRE).decode('utf-8', errors='replace')
        except Exception as e:
            out['status'] = 'banner_error'
            out['error'] = str(e)
        if expect:
            try:
                out['expect_data'] = r.recvuntil(expect.encode(), timeout=max(PRE, 0.5)).decode('utf-8', errors='replace')
            except Exception as e:
                out['status'] = 'expect_error'
                out['error'] = str(e)
        payload = to_bytes(payload_text, payload_hex)
        if payload is not None:
            out['send_size'] = len(payload)
            if line_mode:
                r.sendline(payload)
            else:
                r.send(payload)
        try:
            out['body'] = r.recvrepeat(POST).decode('utf-8', errors='replace')
        except EOFError as e:
            out['status'] = 'eof'
            out['error'] = str(e)
        except Exception as e:
            out['status'] = 'read_error'
            out['error'] = str(e)
        try:
            if r.connected():
                r.shutdown('send')
        except Exception:
            pass
        try:
            tail = r.recvrepeat(0.2).decode('utf-8', errors='replace')
            out['body'] += tail
        except Exception:
            pass
    finally:
        try:
            if r is not None:
                r.close()
        except Exception:
            pass
    blob = out['banner'] + out['expect_data'] + out['body'] + out['error']
    out['flags'] = list(dict.fromkeys(FLAG_RE.findall(blob)))
    print(json.dumps(out, ensure_ascii=False))

run_case('baseline', ${JSON.stringify(args.baselinePayloadText || "")}, ${JSON.stringify(args.baselinePayloadHex || "")}, ${baselineLine ? "True" : "False"}, ${JSON.stringify(args.baselineExpect || "")})
run_case('mutant', ${JSON.stringify(args.mutantPayloadText || "")}, ${JSON.stringify(args.mutantPayloadHex || "")}, ${mutantLine ? "True" : "False"}, ${JSON.stringify(args.mutantExpect || "")})
`
    await writeFile(driver, script, "utf8")
    const { stdout, stderr } = await safeExecWithStreams("python", [driver], {
      timeoutMs: timeoutMs + 4000,
      maxBuffer: 2 * 1024 * 1024,
    })
    try {
      await rm(driverDir, { recursive: true, force: true })
    } catch {}
    const rows = String(stdout || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        try {
          return JSON.parse(x)
        } catch {
          return null
        }
      })
      .filter(Boolean) as any[]
    const baseline = rows.find((x) => x.name === "baseline") || { banner: "", body: "", error: stderr || "", flags: [] }
    const mutant = rows.find((x) => x.name === "mutant") || { banner: "", body: "", error: stderr || "", flags: [] }
    const baseBlob = `${baseline.banner || ""}${baseline.expect_data || ""}${baseline.body || ""}${baseline.error || ""}`
    const mutantBlob = `${mutant.banner || ""}${mutant.expect_data || ""}${mutant.body || ""}${mutant.error || ""}`
    const payload = {
      schema_version: "pwn_remote_fingerprint.v1",
      remote: `${args.host}:${args.port}`,
      baseline: {
        send_size: baseline.send_size || 0,
        status: baseline.status || classifyClosure(baseBlob),
        banner_lines: splitLines(baseline.banner || ""),
        body_lines: splitLines(baseline.body || ""),
        eof_shape: classifyClosure(baseBlob),
        leak_shape: leakShape(baseBlob),
        flags: baseline.flags || [],
      },
      mutant: {
        send_size: mutant.send_size || 0,
        status: mutant.status || classifyClosure(mutantBlob),
        banner_lines: splitLines(mutant.banner || ""),
        body_lines: splitLines(mutant.body || ""),
        eof_shape: classifyClosure(mutantBlob),
        leak_shape: leakShape(mutantBlob),
        flags: mutant.flags || [],
      },
      diff: {
        banner: diffSummary(baseline.banner || "", mutant.banner || ""),
        body: diffSummary(baseline.body || "", mutant.body || ""),
        pointer_delta: {
          baseline_count: leakShape(baseBlob).pointer_count,
          mutant_count: leakShape(mutantBlob).pointer_count,
          baseline_samples: leakShape(baseBlob).sample_pointers,
          mutant_samples: leakShape(mutantBlob).sample_pointers,
        },
      },
      stderr_compact: compact(stderr),
      transport: classifyTransport(`${baseBlob}\n${mutantBlob}`),
      pow_detected: /proof.?of.?work|pow|hashcash|sha256\(/i.test(`${baseBlob}\n${mutantBlob}`),
      restart_likely: restartLikely(baseBlob, mutantBlob),
      stable_banner:
        splitLines(baseline.banner || "").join("\n") === splitLines(mutant.banner || "").join("\n"),
      binary_protocol_likely: binaryProtocolLikely(`${baseBlob}\n${mutantBlob}`),
      best_fast_path:
        binaryProtocolLikely(`${baseBlob}\n${mutantBlob}`)
          ? "compare fixed headers, response lengths, and one byte/field mutation only"
          : "lock the prompt/banner shape, then make exactly one payload-family change",
      one_variable_probe:
        binaryProtocolLikely(`${baseBlob}\n${mutantBlob}`)
          ? "one short hex-field or one-byte mutation only"
          : "one baseline vs one mutant payload only",
      recommended_next_action:
        binaryProtocolLikely(`${baseBlob}\n${mutantBlob}`)
          ? "use ctf-proto-probe to compare fixed headers, response lengths, and one minimal payload mutation"
          : "lock the prompt/banner shape, then make exactly one payload-family change",
      fallback_action: "if the same banner still hides inconsistent leak classes, keep payload structure fixed and compare one baseline vs one mutant only",
      stop_if: "PoW, restart drift, or binary-stateful protocol effects dominate after a few bounded probes; ESCALATE: ctf-expert",
      matching_guess:
        splitLines(baseline.banner || "").join("\n") === splitLines(mutant.banner || "").join("\n")
          ? "likely_same_banner_shape"
          : "banner_differs",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_REMOTE_FINGERPRINT",
      `remote: ${payload.remote}`,
      `matching_guess: ${payload.matching_guess}`,
      `transport: ${payload.transport}`,
      `pow_detected: ${payload.pow_detected}`,
      `restart_likely: ${payload.restart_likely}`,
      `stable_banner: ${payload.stable_banner}`,
      `binary_protocol_likely: ${payload.binary_protocol_likely}`,
      `best_fast_path: ${payload.best_fast_path}`,
      `one_variable_probe: ${payload.one_variable_probe}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `stop_if: ${payload.stop_if}`,
      `baseline: status=${payload.baseline.status} send_size=${payload.baseline.send_size} eof_shape=${payload.baseline.eof_shape} leak_count=${payload.baseline.leak_shape.pointer_count}`,
      `mutant: status=${payload.mutant.status} send_size=${payload.mutant.send_size} eof_shape=${payload.mutant.eof_shape} leak_count=${payload.mutant.leak_shape.pointer_count}`,
      "baseline_banner:",
      ...(payload.baseline.banner_lines.length ? payload.baseline.banner_lines.map((x) => `- ${x}`) : ["- none"]),
      "baseline_body:",
      ...(payload.baseline.body_lines.length ? payload.baseline.body_lines.map((x) => `- ${x}`) : ["- none"]),
      "mutant_body:",
      ...(payload.mutant.body_lines.length ? payload.mutant.body_lines.map((x) => `- ${x}`) : ["- none"]),
      `pointer_delta: baseline=${payload.diff.pointer_delta.baseline_count} mutant=${payload.diff.pointer_delta.mutant_count}`,
      `baseline_pointers: ${payload.diff.pointer_delta.baseline_samples.join(" | ") || "none"}`,
      `mutant_pointers: ${payload.diff.pointer_delta.mutant_samples.join(" | ") || "none"}`,
      `flags: baseline=${payload.baseline.flags.join(" | ") || "none"} mutant=${payload.mutant.flags.join(" | ") || "none"}`,
      "stderr_compact:",
      payload.stderr_compact || "none",
      "contract:",
      "- Low-noise: one baseline connection and one mutant connection only.",
      "- Use to compare remote instance shape, not to brute-force or solve.",
      "- Pointer count/sample differences help judge same-build vs drift when a harmless leak primitive exists.",
    ].join("\n")
  },
})
