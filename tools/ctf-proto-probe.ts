import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

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

function classifyProtocol(text: string) {
  const lower = String(text || "").toLowerCase()
  if (/choice|menu|select|add|edit|delete|show/.test(lower)) return "menu"
  if (/enter|input|name|password|size|length|: $|> $/.test(lower)) return "prompt-response"
  if (/\x00|�/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return "binary-framed-likely"
  return "raw-or-line"
}

function hexPreview(buf: Buffer, limit = 64) {
  return buf.subarray(0, limit).toString("hex")
}

export default tool({
  description:
    "CTF proto probe: send one lightweight ASCII/hex/raw payload to a remote socket service and summarize protocol shape and response deltas.",
  args: {
    host: tool.schema.string().describe("Remote host."),
    port: tool.schema.number().describe("Remote port."),
    asciiPayload: tool.schema.string().optional().describe("ASCII payload to send."),
    hexPayload: tool.schema.string().optional().describe("Hex payload to send."),
    lineMode: tool.schema.boolean().optional().describe("Send ASCII payload with a newline. Default true."),
    recvSize: tool.schema.number().optional().describe("Receive cap in bytes. Default 512."),
    recvTimeoutMs: tool.schema.number().optional().describe("Receive timeout in ms. Default 1200."),
    preReadMs: tool.schema.number().optional().describe("Initial banner read window in ms. Default 400."),
    retries: tool.schema.number().optional().describe("Connection attempts. Default 1."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const recvSize = Math.max(64, Math.min(args.recvSize ?? 512, 8192))
    const recvTimeoutMs = Math.max(100, Math.min(args.recvTimeoutMs ?? 1200, 10000))
    const preReadMs = Math.max(50, Math.min(args.preReadMs ?? 400, 5000))
    const retries = Math.max(1, Math.min(args.retries ?? 1, 5))
    const lineMode = args.lineMode !== false
    const driverDir = path.join(os.tmpdir(), `proto-probe-${randomUUID().slice(0, 12)}`)
    await mkdir(driverDir, { recursive: true })
    const driver = path.join(driverDir, "proto_probe.py")
    const script = `#!/usr/bin/env python3
from pwn import *
import json

HOST = ${JSON.stringify(String(args.host))}
PORT = ${Number(args.port)}
RECV_SIZE = ${recvSize}
PRE = ${preReadMs / 1000}
POST = ${recvTimeoutMs / 1000}
RETRIES = ${retries}
LINE = ${lineMode ? "True" : "False"}
ASCII = ${JSON.stringify(args.asciiPayload || "")}
HEX = ${JSON.stringify(args.hexPayload || "")}

def make_payload():
    if HEX:
        return bytes.fromhex(''.join(ch for ch in HEX if ch in '0123456789abcdefABCDEF'))
    return ASCII.encode('latin1', errors='ignore')

rows = []
payload = make_payload()
for i in range(RETRIES):
    row = {"attempt": i + 1, "banner": "", "body_hex": "", "body_text": "", "status": "ok", "error": ""}
    r = None
    try:
        try:
            r = remote(HOST, PORT, timeout=max(1, int(POST) + 1))
        except Exception as e:
            row["status"] = "connect_error"
            row["error"] = str(e)
            rows.append(row)
            continue
        try:
            row["banner"] = r.recvrepeat(PRE).decode('utf-8', errors='replace')
        except Exception as e:
            row["status"] = "banner_error"
            row["error"] = str(e)
        if payload:
            if LINE and not HEX:
                r.sendline(payload)
            else:
                r.send(payload)
        try:
            blob = r.recvn(RECV_SIZE, timeout=POST)
        except Exception:
            try:
                blob = r.recvrepeat(POST)
            except EOFError as e:
                blob = b""
                row["status"] = "eof"
                row["error"] = str(e)
            except Exception as e:
                blob = b""
                row["status"] = "read_error"
                row["error"] = str(e)
        row["body_hex"] = blob.hex()
        row["body_text"] = blob.decode('utf-8', errors='replace')
    finally:
        try:
            if r is not None:
                r.close()
        except Exception:
            pass
    rows.append(row)
print(json.dumps(rows, ensure_ascii=False))
`
    await writeFile(driver, script, "utf8")
    const { stdout, stderr } = await safeExecWithStreams("python", [driver], {
      timeoutMs: recvTimeoutMs * retries + 5000,
      maxBuffer: 2 * 1024 * 1024,
    })
    try {
      await rm(driverDir, { recursive: true, force: true })
    } catch {}

    const parsed = JSON.parse(String(stdout || "[]")) as Array<{
      attempt: number
      banner: string
      body_hex: string
      body_text: string
      status: string
      error: string
    }>
    const first = parsed[0] || { banner: "", body_hex: "", body_text: "", status: "empty", error: "" }
    const stableBanner = parsed.every((row) => row.banner === first.banner)
    const responseLengths = parsed.map((row) => row.body_hex.length / 2)
    const payloadBytes = args.hexPayload
      ? Buffer.from(String(args.hexPayload).replace(/[^0-9a-fA-F]/g, ""), "hex")
      : Buffer.from(String(args.asciiPayload || ""), "latin1")
    const allText = parsed.map((row) => `${row.banner}\n${row.body_text}`).join("\n")
    const payload = {
      schema_version: "proto_probe.v1",
      remote: `${args.host}:${args.port}`,
      attempts: parsed.length,
      stable_banner: stableBanner,
      protocol_guess: classifyProtocol(allText),
      payload_mode: args.hexPayload ? "hex-or-binary" : lineMode ? "ascii-line" : "ascii-raw",
      payload_size: payloadBytes.length,
      payload_hex_preview: hexPreview(payloadBytes),
      response_lengths: responseLengths,
      fixed_header_likely: parsed.every((row) => row.body_hex.slice(0, 8) === first.body_hex.slice(0, 8)) && first.body_hex.length >= 8,
      best_fast_path:
        classifyProtocol(allText) === "binary-framed-likely"
          ? "keep probes header/length-focused until one framing rule is stable"
          : "lock one minimal transport harness, then mutate exactly one payload variable",
      one_variable_probe:
        args.hexPayload
          ? "change one short hex field or one byte only and compare response length/header"
          : "change one ASCII token or one line terminator only",
      recommended_next_action:
        classifyProtocol(allText) === "binary-framed-likely"
          ? "keep probes minimal and compare fixed headers/length deltas before changing exploit family"
          : "use the observed banner/prompt shape to lock a minimal send/recv harness before mutating payload structure",
      fallback_action: "if baseline responses drift across connections, compare one harmless baseline and one mutant payload with ctf-pwn-remote-check",
      stop_if: "multi-state protocol behavior dominates or no stable response shape appears after a few bounded probes; ESCALATE: ctf-expert",
      attempts_detail: parsed.map((row) => ({
        attempt: row.attempt,
        status: row.status,
        banner_lines: splitLines(row.banner, 6),
        body_lines: splitLines(row.body_text, 6),
        body_hex_preview: row.body_hex.slice(0, 128),
        error: row.error,
      })),
      stderr_compact: compact(stderr),
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PROTO_PROBE",
      `remote: ${payload.remote}`,
      `attempts: ${payload.attempts}`,
      `stable_banner: ${payload.stable_banner}`,
      `protocol_guess: ${payload.protocol_guess}`,
      `payload_mode: ${payload.payload_mode}`,
      `payload_size: ${payload.payload_size}`,
      `payload_hex_preview: ${payload.payload_hex_preview || "none"}`,
      `response_lengths: ${payload.response_lengths.join(", ") || "none"}`,
      `fixed_header_likely: ${payload.fixed_header_likely}`,
      `best_fast_path: ${payload.best_fast_path}`,
      `one_variable_probe: ${payload.one_variable_probe}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `stop_if: ${payload.stop_if}`,
      "attempts_detail:",
      ...payload.attempts_detail.flatMap((row) => [
        `- attempt ${row.attempt}: status=${row.status} body_hex_preview=${row.body_hex_preview || "none"}`,
        ...(row.banner_lines.length ? row.banner_lines.map((x) => `  banner: ${x}`) : []),
        ...(row.body_lines.length ? row.body_lines.map((x) => `  body: ${x}`) : []),
        ...(row.error ? [`  error: ${row.error}`] : []),
      ]),
      "stderr_compact:",
      payload.stderr_compact || "none",
    ].join("\n")
  },
})
