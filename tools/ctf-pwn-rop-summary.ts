import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"

const execFile = promisify(execFileCb)

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

async function safeExec(cmd: string, args: string[], cwd: string, ms = 7000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 1024 * 1024 })
    return `${stdout}${stderr ? `\n${stderr}` : ""}`
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`
  }
}

function grepLines(text: string, re: RegExp, limit = 40) {
  return text.split(/\r?\n/).filter((line) => re.test(line)).slice(0, limit)
}

function collectWritableSections(readelfS: string) {
  const lines = readelfS.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/\]\s+\.(data|bss|got|got\.plt|fini_array|init_array|dynamic)\b/i.test(line) || /\.(data|bss|got|got\.plt|fini_array|init_array|dynamic)\b/.test(line)) {
      out.push(line.trim())
    }
  }
  return out.slice(0, 20)
}

function parseSymbols(readelfSyms: string) {
  const hits = ["win", "print_flag", "system", "puts", "write", "read", "open", "openat", "mprotect", "execve", "__libc_csu_init", "main", "vuln"]
  const out: Record<string, string> = {}
  for (const name of hits) {
    const line = readelfSyms.split(/\r?\n/).find((x) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`).test(x))
    if (line) out[name] = line.trim()
  }
  return out
}

function routeHints(text: string) {
  const hints: string[] = []
  const lower = text.toLowerCase()
  if (/\bwin\b|print_flag|backdoor/.test(lower)) hints.push("ret2win_candidate")
  if (/system|\/bin\/sh/.test(lower)) hints.push("ret2libc_system_candidate")
  if (/syscall/.test(lower)) hints.push("syscall_rop_candidate")
  if (/__libc_csu_init/.test(lower)) hints.push("ret2csu_candidate")
  if (/leave; ret|stack pivot/.test(lower)) hints.push("stack_pivot_candidate")
  if (/pop rdi ; ret/.test(lower)) hints.push("arg_control_pop_rdi_present")
  return hints.length ? hints : ["collect_control_and_leak_first"]
}

function firstNonEmpty(lines: string[]) {
  return lines.length ? lines[0].trim() : "none"
}

export default tool({
  description: "CTF pwn ROP summary: gather common gadgets, writable sections, symbol clues, and route hints for ret2win/ROP/syscall branches.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative ELF binary path."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per external tool call in ms. Default 7000."),
  },
  async execute(args, context) {
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const cwd = path.dirname(binary)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 7000, 30000))

    const ropOut = await safeExec("ROPgadget", ["--binary", binary, "--only", "pop|ret|syscall|leave"], cwd, timeoutMs)
    const readelfS = await safeExec("readelf", ["-S", binary], cwd, timeoutMs)
    const readelfSyms = await safeExec("readelf", ["-Ws", binary], cwd, timeoutMs)
    const nmOut = await safeExec("nm", ["-an", binary], cwd, timeoutMs)
    const stringsOut = await safeExec("strings", [binary], cwd, timeoutMs)
    const objdumpDisasm = await safeExec("objdump", ["-d", "-M", "intel", binary], cwd, timeoutMs)

    const gadgetMatches = {
      ret: grepLines(ropOut, /:\s*ret\b/i, 8),
      pop_rdi: grepLines(ropOut, /pop rdi ; ret/i, 8),
      pop_rsi: grepLines(ropOut, /pop rsi( ; pop r15)? ; ret/i, 8),
      pop_rdx: grepLines(ropOut, /pop rdx/i, 8),
      syscall: grepLines(ropOut, /syscall/i, 8),
      leave_ret: grepLines(ropOut, /leave ; ret/i, 8),
    }

    const writableSections = collectWritableSections(readelfS)
    const interestingStrings = grepLines(stringsOut, /\/bin\/sh|flag|sh|cat flag|binsh/i, 20)
    const symbols = parseSymbols(`${readelfSyms}\n${nmOut}`)
    const summaryText = [ropOut, readelfSyms, nmOut, stringsOut].join("\n")
    const hints = routeHints(summaryText)
    const disasmAnalysis = analyzePwnDisasmText(objdumpDisasm)
    const gadgetPresence = {
      pop_rdi: firstNonEmpty(gadgetMatches.pop_rdi),
      pop_rsi: firstNonEmpty(gadgetMatches.pop_rsi),
      pop_rdx: firstNonEmpty(gadgetMatches.pop_rdx),
      ret: firstNonEmpty(gadgetMatches.ret),
      syscall: firstNonEmpty(gadgetMatches.syscall),
      leave_ret: firstNonEmpty(gadgetMatches.leave_ret),
    }

    return [
      "pwn_rop_summary:",
      `binary: ${binary}`,
      "route_hints:",
      ...hints.map((x) => `- ${x}`),
      "symbol_clues:",
      ...Object.entries(symbols).map(([k, v]) => `- ${k}: ${v}`),
      "red_flag_tags:",
      ...(disasmAnalysis.redFlagTags.length ? disasmAnalysis.redFlagTags.map((x: string) => `- ${x}`) : ["- none"]),
      "constraint_hints:",
      ...(disasmAnalysis.constraintHints.length ? disasmAnalysis.constraintHints.map((x: string) => `- ${x}`) : ["- none"]),
      "stack_layout_hints:",
      ...(disasmAnalysis.stackLayoutHints.length ? disasmAnalysis.stackLayoutHints.map((x: string) => `- ${x}`) : ["- none"]),
      "writable_sections:",
      ...(writableSections.length ? writableSections.map((x) => `- ${x}`) : ["- none"]),
      "gadget_presence:",
      ...Object.entries(gadgetPresence).map(([k, v]) => `- ${k}: ${v}`),
      "gadget_summary:",
      ...(Object.entries(gadgetMatches).flatMap(([k, arr]) => arr.length ? [`- ${k}:`, ...arr.map((x) => `  - ${x.trim()}`)] : [`- ${k}: none`])),
      "interesting_strings:",
      ...(interestingStrings.length ? interestingStrings.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      hints.includes("ret2win_candidate") ? "- Prove offset/control and test the direct win route before wider gadget hunting." : "- Use this summary only after control proof or a clear leak path exists.",
      hints.includes("arg_control_pop_rdi_present") ? "- `pop rdi ; ret` is present; if a leak and libc/base path exists, prefer shortest argument-controlled ret2libc before gadget roulette." : "- If arg-control gadgets are absent, consider ret2csu, stack pivot, or write/data-only closure paths.",
      hints.includes("syscall_rop_candidate") ? "- If seccomp or static constraints exist, check whether a syscall-oriented ORW route is shorter than shell closure." : "- If libc route stalls, recheck writable memory and ret2csu/syscall candidates.",
      ...(disasmAnalysis.routePressure.length ? disasmAnalysis.routePressure.map((x: string) => `- ${x}`) : ["- If a checker-like stack write appears in disassembly, prefer frame-layout reduction before wider gadget drift."]),
    ].join("\n")
  },
})
