import { tool } from "@opencode-ai/plugin"
import { readdir, readFile, stat } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"

const execFile = promisify(execFileCb)
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

async function exists(file: string) {
  try { await stat(file); return true } catch { return false }
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

async function tryExec(cmd: string, args: string[], cwd: string, timeout = 5000) {
  try {
    const res = await execFile(cmd, args, { cwd, timeout, maxBuffer: 1024 * 1024 })
    return `${res.stdout}${res.stderr}`.trim()
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ?? e.message ?? ""}`.trim()
  }
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

  if (/format string/.test(e)) scores.fmt += 4
  if (/%n\b/.test(e)) scores.fmt += 4
  if (/%p|%s/.test(e)) scores.fmt += 2
  if (/printf|fprintf|sprintf|snprintf/.test(e)) scores.fmt += 1

  if (/seccomp|syscall|openat|orw|static/.test(e)) scores.orw += 4
  if (/seccomp|syscall filter|seccomp-bpf/.test(e)) scores.orw += 2

  if (/malloc|free|realloc|heap/.test(e)) scores["heap-simple"] += 2
  if (/tcache|fastbin|unsorted|double free|uaf|use.after.free/.test(e)) scores["heap-simple"] += 4
  if (/choice|menu|index|add|edit|delete|remove|show|buy|sell|name|desc|description/.test(e)) scores["heap-simple"] += 2
  if (/new\s+0x1c|memcpy\s*\([^\n]+obj\s*\+\s*8|vtable|function pointer|virtual call|dispatch|object overwrite|adjacent object|double deref|\*\(\*\(/.test(e)) scores["heap-simple"] += 5

  if (/shellcode|mprotect|read\(0|gets\(|nx disabled|rwx/.test(e)) scores.shellcode += 4
  if (/gnu_stack.*rwe|gnu_stack.*rwx|executable stack|jmp rsp|jmp esp|call rsp|call esp|read\(0, rsp|read\(0, esp|short stager|stage-2|stager/.test(e)) scores.shellcode += 5
  if (/seccomp/.test(e) && /jmp rsp|jmp esp|rwx|executable stack/.test(e)) scores.orw += 3
  if (/win|print_flag|backdoor|give_shell|system\(|cat flag|\/bin\/sh/.test(e)) scores.ret2win += 4
  if (/choice|menu|index|add|edit|delete|remove|show/.test(e) && /system\(|\/bin\/sh/.test(e)) scores.ret2win -= 2
  if (/puts@|puts\b|got|plt|libc|__libc_start_main/.test(e)) scores.ret2libc += 3
  if (/call.*<read@plt>|call.*<recv@plt>|call.*<fgets@plt>|call.*<gets@plt>/.test(e) && /mov\s+byte ptr\s+\[.*bp-0x[0-9a-f]+\],0x0/.test(e)) scores.raw += 4
  if (/mov\s+byte ptr\s+\[.*bp[^\n]*\+.*\],/.test(e)) scores.raw += 3
  if (/cmp\s+dword ptr\s+\[.*bp-0x[0-9a-f]+\],0x[0-9a-f]+/.test(e) && /mov\s+byte ptr\s+\[.*bp[^\n]*\+.*\],/.test(e)) scores.raw += 3

  const ordered = ["heap-simple", "fmt", "orw", "ret2win", "ret2libc", "shellcode", "raw"] as const
  const best = ordered.reduce((acc, route) => scores[route] > scores[acc] ? route : acc, "raw")
  return { route: best, scores }
}

function substrate(runtimeArtifacts: { dockerfile: string[]; compose: string[] }, libc: string[], route: string, fileInfo: string) {
  if (runtimeArtifacts.compose.length || runtimeArtifacts.dockerfile.length) return "challenge-docker"
  if (process.platform === "win32" && /elf/i.test(fileInfo)) return "pwnlab-runbox-general"
  if (libc.length || route === "ret2libc" || route === "heap-simple") return "pwnlab-runbox-general"
  return "host-triage-or-pwnlab-runbox"
}

async function detectRemoteHints(files: string[]) {
  const hints: string[] = []
  for (const file of files.slice(0, 24)) {
    const base = path.basename(file)
    if (!/\.(txt|md|py|sh|json|ya?ml|toml|ini|cfg|conf|log)$/i.test(base)) continue
    try {
      const text = (await readFile(file, "utf8")).slice(0, 20000)
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (/remote\s*\(\s*["'][^"']+["']\s*,\s*\d{2,5}\s*\)/i.test(trimmed) || /\bnc\s+[^\s]+\s+\d{2,5}\b/i.test(trimmed) || /\b(?:host|server|remote)\s*[:=]\s*[^\s:]+\b/i.test(trimmed) || /\b[A-Za-z0-9.-]+:\d{2,5}\b/.test(trimmed)) {
          hints.push(`${base}: ${trimmed.slice(0, 140)}`)
          break
        }
      }
    } catch {}
    if (hints.length >= 5) break
  }
  return hints
}

export default tool({
  description: "CTF PWN fast bootstrap: scan artifacts, guess route/template/substrate, and recommend the next fast probe without solving.",
  args: {
    targetDir: tool.schema.string().optional().describe("Workspace-relative challenge directory. Default current directory."),
    binary: tool.schema.string().optional().describe("Workspace-relative binary override."),
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
    const candidates = args.binary ? [resolveInsideWorkspace(context.directory, args.binary)] : files.filter(isLikelyBinaryName).slice(0, 8)
    const binary = candidates[0] ? rel(candidates[0]) : ""

    let fileInfo = ""
    let symbols = ""
    let strings = ""
    let programHeaders = ""
    let disasm = ""
    if (binary) {
      const binAbs = resolveInsideWorkspace(context.directory, binary)
      fileInfo = await tryExec("file", [binAbs], context.directory)
      programHeaders = await tryExec("readelf", ["-W", "-l", binAbs], context.directory)
      disasm = await tryExec("objdump", ["-d", "-M", "intel", binAbs], context.directory)
      symbols = await tryExec("nm", ["-an", binAbs], context.directory)
      strings = await tryExec("strings", ["-a", binAbs], context.directory)
      if (!strings) {
        try {
          const raw = await readFile(binAbs)
          strings = raw.toString("latin1").replace(/[^ -~\n]/g, "\n").split("\n").filter((s) => s.length >= 4).slice(0, 200).join("\n")
        } catch {}
      }
    }

    const interestingSymbols = symbols.split(/\r?\n/).filter((l) => / win|print_flag|backdoor|system|puts|printf|read|gets|main|malloc|free|mprotect|syscall/i.test(l)).slice(0, 18)
    const interestingStrings = strings.split(/\r?\n/).filter((l) => /flag|win|backdoor|system|\/bin\/sh|%p|%s|malloc|free|choice|menu|name|password/i.test(l)).slice(0, 18)
    const evidence = [fileInfo, programHeaders, disasm, interestingSymbols.join("\n"), interestingStrings.join("\n")].join("\n")
    const routeDecision = classifyRoute(evidence)
    const route = routeDecision.route
    const selectedTemplate = TEMPLATE_BY_ROUTE[route]
    const selectedSubstrate = substrate({ dockerfile, compose }, libc, route, fileInfo)
    const disasmAnalysis = analyzePwnDisasmText(disasm)
    const remoteHints = await detectRemoteHints(files)
    const recommendedRunner = process.platform === "win32" && /elf/i.test(fileInfo) ? "ctf-pwn-docker-runner" : "ctf-pwn-runner"

    const payload = {
      schema_version: "pwn_fast_bootstrap.v1",
      target_dir: relToRoot(root),
      binary,
      candidates: candidates.map(rel),
      libc,
      ld,
      runtime_artifacts: { dockerfile, compose },
      file_info: fileInfo,
      interesting_symbols: interestingSymbols,
      interesting_strings: interestingStrings,
      route_guess: route,
      route_scores: routeDecision.scores,
      red_flag_tags: disasmAnalysis.redFlagTags,
      constraint_hints: disasmAnalysis.constraintHints,
      stack_layout_hints: disasmAnalysis.stackLayoutHints,
      template: selectedTemplate,
      substrate: selectedSubstrate,
      recommended_runner: recommendedRunner,
      host_guardrail: process.platform === "win32" && /elf/i.test(fileInfo)
        ? "windows_host_linux_elf_default_to_locked_linux_substrate"
        : "none",
      substrate_gate: libc.length || ld.length ? "bundled_libc_present_force_runtime_doctor" : "none",
      next_probe: binary
        ? libc[0] || ld[0]
          ? `ctf-pwn-libc-runtime-doctor binary=${binary}${libc[0] ? ` libc=${libc[0]}` : ""}${ld[0] ? ` ld=${ld[0]}` : ""}; then ctf-pwn-template-init route=${route} binary=${binary}${libc[0] ? ` libc=${libc[0]}` : ""}`
          : process.platform === "win32" && /elf/i.test(fileInfo)
            ? `ctf-pwn-linux-session binary=${binary}; then ctf-pwn-template-init route=${route} binary=${binary}; keep later runner/gdb/expect on that runtimeProfileId`
            : `ctf-pwn-template-init route=${route} binary=${binary}${libc[0] ? ` libc=${libc[0]}` : ""}; then edit/run exploit.py`
        : "identify main ELF or run ctf-file-triage",
      handoff_risk: route === "heap-simple" || selectedSubstrate === "challenge-docker" ? "medium" : "low",
      bootstrap_notes: route === "shellcode"
        ? ["shellcode fast-lane: verify jmp rsp/exec stack/read-to-stack before raw fallback", "prefer shellcode/orw template over raw when stack execution or short stager evidence exists"]
        : route === "orw"
          ? ["orw fast-lane: verify seccomp/syscall surface and direct file-read closure before shell"]
          : [],
      remote_hints: remoteHints,
    }

    payload.bootstrap_notes.push(...disasmAnalysis.redFlagNotes)
    payload.bootstrap_notes.push(...disasmAnalysis.routePressure)
    if (remoteHints.length) payload.bootstrap_notes.push("remote host/port clues detected nearby: keep this bundle in the PWN fast lane even if it first arrives as a zip/archive wrapper")

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_FAST_BOOTSTRAP",
      `target_dir: ${payload.target_dir}`,
      `binary: ${payload.binary}`,
      `candidates: ${payload.candidates.join(", ")}`,
      `libc: ${payload.libc.join(", ")}`,
      `ld: ${payload.ld.join(", ")}`,
      `dockerfile: ${payload.runtime_artifacts.dockerfile.join(", ")}`,
      `compose: ${payload.runtime_artifacts.compose.join(", ")}`,
      `file_info: ${payload.file_info}`,
      `route_guess: ${payload.route_guess}`,
      `route_scores: ${Object.entries(payload.route_scores).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      `red_flag_tags: ${payload.red_flag_tags.join(", ")}`,
      `constraint_hints: ${payload.constraint_hints.join(" | ")}`,
      `stack_layout_hints: ${payload.stack_layout_hints.join(" | ")}`,
      `template: ${payload.template}`,
      `substrate: ${payload.substrate}`,
      `recommended_runner: ${payload.recommended_runner}`,
      `substrate_gate: ${payload.substrate_gate}`,
      `interesting_symbols: ${payload.interesting_symbols.join(" | ")}`,
      `interesting_strings: ${payload.interesting_strings.join(" | ")}`,
      `remote_hints: ${payload.remote_hints.join(" | ")}`,
      `next_probe: ${payload.next_probe}`,
      `handoff_risk: ${payload.handoff_risk}`,
      ...(payload.bootstrap_notes.length ? payload.bootstrap_notes.map((x) => `bootstrap_note: ${x}`) : []),
    ].join("\n")
  },
})
