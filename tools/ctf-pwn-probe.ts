import { tool } from "@opencode-ai/plugin"
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

const TEMPLATE_BY_ROUTE: Record<string, string> = {
  ret2win: "pwn_fast_ret2win.py",
  ret2libc: "pwn_fast_ret2libc.py",
  fmt: "pwn_fast_fmt.py",
  orw: "pwn_fast_orw.py",
  shellcode: "pwn_fast_shellcode.py",
  "heap-simple": "pwn_fast_menu.py",
  raw: "pwn_fast_raw.py",
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function walk(root: string, maxFiles: number) {
  const out: string[] = []
  async function rec(dir: string) {
    if (out.length >= maxFiles) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (out.length >= maxFiles) break
      if (["node_modules", ".git", "extracted", "work", "__pycache__"].includes(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await rec(full)
      else out.push(full)
    }
  }
  await rec(root)
  return out
}

function isLikelyBinaryName(file: string) {
  const base = path.basename(file).toLowerCase()
  if (/^(libc\.so|ld-linux|ld-|dockerfile|docker-compose|compose\.ya?ml)/.test(base)) return false
  if (/\.(c|cc|cpp|h|py|js|md|txt|json|ya?ml|sh|ps1|zip|tar|gz|7z|png|jpg|pcap|pdf)$/i.test(base)) return false
  return /(^chall$|^pwn$|^vuln$|^main$|^baby|^heap|^fmt|^rop|\.elf$|\.bin$|\.out$)/i.test(base) || !base.includes(".")
}

function classifyRoute(evidence: string) {
  const e = evidence.toLowerCase()
  const scores: Record<string, number> = {
    ret2win: 0,
    ret2libc: 0,
    fmt: 0,
    orw: 0,
    shellcode: 0,
    "heap-simple": 0,
    raw: 0,
  }
  if (/format string/.test(e) || /%n\b/.test(e) || /%p|%s/.test(e)) scores.fmt += 4
  if (/seccomp|syscall|openat|orw|static/.test(e)) scores.orw += 4
  if (/malloc|free|realloc|heap|tcache|fastbin|double free|uaf/.test(e)) scores["heap-simple"] += 4
  if (/shellcode|mprotect|gets\(|nx disabled|rwx|exec stack/.test(e)) scores.shellcode += 4
  if (/win|print_flag|backdoor|give_shell|system\(|cat flag|\/bin\/sh/.test(e)) scores.ret2win += 4
  if (/puts@|got|plt|libc|__libc_start_main/.test(e)) scores.ret2libc += 3
  if (/protocol|socket|binary framed|length-prefixed|raw/.test(e)) scores.raw += 3
  const ordered = ["heap-simple", "fmt", "orw", "ret2win", "ret2libc", "shellcode", "raw"] as const
  const best = ordered.reduce((acc, route) => (scores[route] > scores[acc] ? route : acc), "raw")
  return { route: best, scores }
}

function substrate(runtimeArtifacts: { dockerfile: string[]; compose: string[] }, libc: string[], route: string, fileInfo: string) {
  if (runtimeArtifacts.compose.length || runtimeArtifacts.dockerfile.length) return "challenge-docker"
  if (process.platform === "win32" && /elf/i.test(fileInfo)) return "pwnlab-runbox-general"
  if (libc.length || route === "ret2libc" || route === "heap-simple") return "pwnlab-runbox-general"
  return "host-triage-or-pwnlab-runbox"
}

function splitLines(text: string, max = 10) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter(Boolean)
    .slice(0, max)
}

export default tool({
  description:
    "CTF pwn probe: unified lightweight bootstrap for local binaries or remote services that guesses route, interaction mode, and the next fast-lane probe.",
  args: {
    targetDir: tool.schema.string().optional().describe("Workspace-relative challenge directory. Default current directory."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary override."),
    host: tool.schema.string().optional().describe("Optional remote host."),
    port: tool.schema.number().optional().describe("Optional remote port."),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 120."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const root = resolveInsideWorkspace(context.directory, args.targetDir || ".")
    const maxFiles = Math.max(20, Math.min(args.maxFiles ?? 120, 500))
    const files = await walk(root, maxFiles)
    const rel = (f: string) => path.relative(context.directory, f).replace(/\\/g, "/")
    const relToRoot = (f: string) => path.relative(root, f).replace(/\\/g, "/") || "."
    const libc = files.filter((f) => /libc\.so(\.\d+)?$/i.test(path.basename(f))).map(rel)
    const ld = files.filter((f) => /ld-linux|ld-.*\.so/i.test(path.basename(f))).map(rel)
    const dockerfile = files.filter((f) => /^dockerfile/i.test(path.basename(f))).map(rel)
    const compose = files.filter((f) => /docker-compose|compose\.ya?ml/i.test(path.basename(f))).map(rel)
    const candidates = args.binary
      ? [resolveInsideWorkspace(context.directory, args.binary)]
      : files.filter(isLikelyBinaryName).slice(0, 8)
    const binary = candidates[0] ? rel(candidates[0]) : ""

    let fileInfo = ""
    let strings = ""
    if (binary) {
      const binAbs = resolveInsideWorkspace(context.directory, binary)
      try {
        const fileStat = await stat(binAbs)
        if (fileStat.size <= 4 * 1024 * 1024) {
          const raw = await readFile(binAbs)
          strings = raw
            .toString("latin1")
            .replace(/[^ -~\n]/g, "\n")
            .split("\n")
            .filter((s) => s.length >= 4)
            .slice(0, 200)
            .join("\n")
        }
      } catch {}
      fileInfo = binary
    }

    let remoteSummary: {
      banner: string[]
      body: string[]
      protocolGuess: string
      transport: string
      powDetected: boolean
      restartLikely: boolean
      binaryProtocolLikely: boolean
    } | null = null

    if (args.host && args.port) {
      const driverDir = await mkdtemp(path.join(os.tmpdir(), "pwn-probe-"))
      const driver = path.join(driverDir, "remote_probe.py")
      const script = `#!/usr/bin/env python3
from pwn import *
import json, re
HOST=${JSON.stringify(String(args.host))}
PORT=${Number(args.port)}
r = None
out = {"banner":"", "body":"", "status":"ok", "error":""}
try:
    r = remote(HOST, PORT, timeout=2)
    out["banner"] = r.recvrepeat(0.4).decode('utf-8', errors='replace')
    out["body"] = r.recvrepeat(0.8).decode('utf-8', errors='replace')
except Exception as e:
    out["status"] = "error"
    out["error"] = str(e)
finally:
    try:
        if r is not None:
            r.close()
    except Exception:
        pass
print(json.dumps(out, ensure_ascii=False))
`
      await writeFile(driver, script, "utf8")
      const { stdout } = await safeExecWithStreams("python", [driver], { timeoutMs: 6000, maxBuffer: 512 * 1024 })
      try {
        await rm(driverDir, { recursive: true, force: true })
      } catch {}
      const row = JSON.parse(String(stdout || "{}")) as { banner?: string; body?: string }
      const combinedRemote = `${row.banner || ""}\n${row.body || ""}`
      const binaryProtocolLikely = /\x00|�/.test(combinedRemote) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(combinedRemote)
      const protocolGuess = /choice|menu|select|add|edit|delete|show/i.test(combinedRemote)
        ? "menu"
        : /enter|input|name|password|size|length|: $|> $/i.test(combinedRemote)
          ? "prompt-response"
          : binaryProtocolLikely
            ? "binary-framed-likely"
            : "raw-or-line"
      remoteSummary = {
        banner: splitLines(row.banner || ""),
        body: splitLines(row.body || ""),
        protocolGuess,
        transport: binaryProtocolLikely ? "tcp/raw" : "line-based",
        powDetected: /proof.?of.?work|pow|sha256\(|hashcash/i.test(combinedRemote),
        restartLikely: /new connection|forking|child process|session/i.test(combinedRemote),
        binaryProtocolLikely,
      }
    }

    const localEvidence = [strings, fileInfo, remoteSummary?.banner.join("\n") || "", remoteSummary?.body.join("\n") || ""].join("\n")
    const routeDecision = classifyRoute(localEvidence)
    const route = routeDecision.route
    const selectedTemplate = TEMPLATE_BY_ROUTE[route]
    const selectedSubstrate = substrate({ dockerfile, compose }, libc, route, fileInfo)
    const recommendedRunner =
      process.platform === "win32" && /elf/i.test(fileInfo) ? "ctf-pwn-docker-runner" : "ctf-pwn-runner"

    const nextProbe = remoteSummary
      ? remoteSummary.binaryProtocolLikely
        ? "ctf-proto-probe"
        : "ctf-pwn-remote-check"
      : binary
        ? route === "raw"
          ? "ctf-pwn-runner"
          : "ctf-pwn-template-init"
        : "ctf-file-triage"

    const payload = {
      schema_version: "pwn_probe.v1",
      target_dir: relToRoot(root),
      binary,
      candidates: candidates.map(rel),
      libc,
      ld,
      runtime_artifacts: { dockerfile, compose },
      route_guess: route,
      route_scores: routeDecision.scores,
      template: selectedTemplate,
      substrate: selectedSubstrate,
      recommended_runner: recommendedRunner,
      interaction_mode: remoteSummary?.protocolGuess ?? (route === "heap-simple" ? "menu" : route === "raw" ? "raw-or-line" : "local-binary"),
      remote_behavior: remoteSummary,
      best_fast_path:
        route === "ret2win"
          ? "prove offset/control then direct-call win/backdoor"
          : route === "ret2libc"
            ? "leak once, re-enter, compute libc base, then close with system('/bin/sh') or equivalent"
            : route === "fmt"
              ? "read-only format leak mapping before any write primitive"
              : route === "heap-simple"
                ? "prove exactly one primitive before allocator naming"
                : route === "raw"
                  ? "lock protocol shape first, then build the smallest transport harness"
                  : "pick one crash/leak/protocol oracle and avoid parallel route drift",
      one_variable_probe:
        remoteSummary?.binaryProtocolLikely
          ? "send one minimal hex payload and compare response length/header only"
          : route === "ret2win" || route === "ret2libc"
            ? "capture or confirm one RIP/EIP crash value, then run ctf-pwn-offset"
            : route === "fmt"
              ? "send one read-only %p leak probe and compare pointer classes"
              : route === "heap-simple"
                ? "exercise one add/delete/edit/show cycle and record one primitive signal"
                : "one baseline vs one mutant payload only",
      recommended_next_action: nextProbe,
      fallback_action:
        remoteSummary && !remoteSummary.binaryProtocolLikely
          ? "if remote transcript drifts, run ctf-pwn-remote-check with baseline/mutant payloads before changing exploit family"
          : "if no fast closure family stays plausible after a few bounded probes, escalate instead of widening tools",
      escalate_if:
        route === "heap-simple" || remoteSummary?.binaryProtocolLikely
          ? "protocol/allocator complexity dominates or no stable oracle appears after a few bounded probes; ESCALATE: ctf-expert"
          : "no new crash/leak/control evidence after 2-3 focused probes; ESCALATE: ctf-expert",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_PROBE",
      `target_dir: ${payload.target_dir}`,
      `binary: ${payload.binary}`,
      `candidates: ${payload.candidates.join(", ")}`,
      `libc: ${payload.libc.join(", ")}`,
      `ld: ${payload.ld.join(", ")}`,
      `route_guess: ${payload.route_guess}`,
      `route_scores: ${Object.entries(payload.route_scores)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
      `template: ${payload.template}`,
      `substrate: ${payload.substrate}`,
      `recommended_runner: ${payload.recommended_runner}`,
      `interaction_mode: ${payload.interaction_mode}`,
      `best_fast_path: ${payload.best_fast_path}`,
      `one_variable_probe: ${payload.one_variable_probe}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `escalate_if: ${payload.escalate_if}`,
      ...(payload.remote_behavior
        ? [
            `remote_transport: ${payload.remote_behavior.transport}`,
            `pow_detected: ${payload.remote_behavior.powDetected}`,
            `restart_likely: ${payload.remote_behavior.restartLikely}`,
            `binary_protocol_likely: ${payload.remote_behavior.binaryProtocolLikely}`,
            `remote_banner: ${payload.remote_behavior.banner.join(" | ")}`,
            `remote_body: ${payload.remote_behavior.body.join(" | ")}`,
          ]
        : []),
    ].join("\n")
  },
})
