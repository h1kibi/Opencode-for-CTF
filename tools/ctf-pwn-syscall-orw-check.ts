import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function grepLines(text: string, re: RegExp, limit = 30) {
  return text
    .split(/\r?\n/)
    .filter((line) => re.test(line))
    .slice(0, limit)
    .map((line) => line.trim())
}

function summarizeSyscalls(text: string) {
  const lower = text.toLowerCase()
  const names = [
    "open",
    "openat",
    "read",
    "write",
    "sendfile",
    "readv",
    "writev",
    "mprotect",
    "mmap",
    "execve",
    "rt_sigreturn",
    "sigreturn",
    "syscall",
  ]
  return names.filter((name) => new RegExp(`\\b${name}\\b`).test(lower))
}

function inferArch(text: string) {
  const lower = text.toLowerCase()
  if (/aarch64|arm64|elf 64-bit lsb.*arm/.test(lower)) return "arm64"
  if (/i386|80386|elf32|32-bit/.test(lower)) return "i386"
  if (/x86-64|x86_64|amd64|elf 64-bit lsb/.test(lower)) return "amd64"
  return "unknown"
}

function abiHints(arch: string) {
  if (arch === "amd64")
    return [
      "syscall_number: rax",
      "arg0: rdi",
      "arg1: rsi",
      "arg2: rdx",
      "arg3: r10",
      "ORW typical: open/openat(path, flags), read(fd, buf, size), write(1, buf, n)",
    ]
  if (arch === "i386")
    return [
      "syscall_number: eax",
      "arg0: ebx",
      "arg1: ecx",
      "arg2: edx",
      "interrupt: int 0x80 or sysenter when available",
      "ORW typical: open(path, flags), read(fd, buf, size), write(1, buf, n)",
    ]
  if (arch === "arm64")
    return [
      "syscall_number: x8",
      "arg0: x0",
      "arg1: x1",
      "arg2: x2",
      "arg3: x3",
      "ORW typical: openat(AT_FDCWD, path, flags), read(fd, buf, size), write(1, buf, n)",
    ]
  return ["arch_unknown: run file/readelf first and map syscall number plus argument registers before building ORW"]
}

function routeDecision(syscalls: string[], gadgetText: string, evidence: string) {
  const all = `${syscalls.join(" ")}\n${gadgetText}\n${evidence}`.toLowerCase()
  const hasSyscall = /syscall/.test(all)
  const hasOrw = /\bopen(at)?\b/.test(all) && /\bread\b/.test(all) && /\bwrite\b/.test(all)
  const shellBlocked =
    /seccomp|sandbox|execve.*(deny|block|kill|not allowed)|no execve|shell.*(blocked|fails|denied)/.test(all)
  const execveAllowed = /\bexecve\b/.test(all) && !shellBlocked
  if (shellBlocked && hasOrw) return "prefer_direct_file_read_or_orw_route_over_shell"
  if (hasOrw && hasSyscall) return "orw_route_candidate_if_register_control_and_flag_path_exist"
  if (execveAllowed) return "shell_route_still_candidate_verify_execve_and_binsh"
  if (hasSyscall) return "syscall_route_possible_but_orw_allowlist_incomplete"
  return "collect_syscall_gadgets_or_seccomp_allowlist_before_route_choice"
}

export default tool({
  description:
    "CTF pwn syscall/ORW checker: summarize syscall gadgets, seccomp clues, and whether shell or direct open-read-write file-read routing is better.",
  args: {
    binary: tool.schema.string().optional().describe("Workspace-relative ELF binary path."),
    evidence: tool.schema
      .string()
      .optional()
      .describe("Optional pasted evidence from checksec/seccomp-tools/ROPgadget/notes."),
    seccompReport: tool.schema.string().optional().describe("Optional pasted seccomp allowlist or sandbox report."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per helper command in ms. Default 7000."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 7000, 30000))
    const evidence = [args.evidence ?? "", args.seccompReport ?? ""].join("\n")
    let binary = "not_provided"
    let cwd = context.directory
    let ropOut = ""
    let readelfOut = ""
    let stringsOut = ""
    let fileOut = ""

    if (args.binary) {
      binary = resolveInsideWorkspace(context.directory, args.binary)
      cwd = path.dirname(binary)
      const fileR = await safeExec("file", [binary], cwd, timeoutMs)
      fileOut = fileR.output
      const ropR = await safeExec("ROPgadget", ["--binary", binary, "--only", "pop|syscall|int|ret"], cwd, timeoutMs)
      ropOut = ropR.output
      const readelfR = await safeExec("readelf", ["-Ws", binary], cwd, timeoutMs)
      readelfOut = readelfR.output
      const stringsR = await safeExec("strings", [binary], cwd, timeoutMs)
      stringsOut = stringsR.output
    }

    const combined = [fileOut, ropOut, readelfOut, stringsOut, evidence].join("\n")
    const arch = inferArch(combined)
    const syscalls = summarizeSyscalls(combined)
    const syscallGadgets = grepLines(ropOut, /syscall|int 0x80/i, 16)
    const registerGadgets = {
      rax: grepLines(ropOut, /pop (e|r)ax/i, 6),
      rdi_ebx: grepLines(ropOut, /pop (rdi|ebx)/i, 6),
      rsi_ecx: grepLines(ropOut, /pop (rsi|ecx)/i, 6),
      rdx_edx: grepLines(ropOut, /pop (rdx|edx)/i, 6),
    }
    const seccompClues = grepLines(
      combined,
      /seccomp|sandbox|bpf|prctl|openat|execve|EPERM|SIGSYS|allow|deny|kill/i,
      40,
    )
    const fileReadStrings = grepLines(stringsOut, /flag|\.txt|\/home|\/proc|read|open/i, 20)
    const decision = routeDecision(syscalls, ropOut, evidence)
    const hasOrwNames = syscalls.includes("open") || syscalls.includes("openat")

    return [
      "pwn_syscall_orw_check:",
      "schema_version: pwn_syscall_orw_check.v1",
      `binary: ${binary}`,
      `arch_hint: ${arch}`,
      `route_decision: ${decision}`,
      "syscall_abi_hints:",
      ...abiHints(arch).map((x) => `- ${x}`),
      "detected_syscall_or_api_names:",
      ...(syscalls.length ? syscalls.map((x) => `- ${x}`) : ["- none"]),
      "syscall_gadgets:",
      ...(syscallGadgets.length ? syscallGadgets.map((x) => `- ${x}`) : ["- none"]),
      "register_control_gadgets:",
      ...Object.entries(registerGadgets).flatMap(([k, v]) =>
        v.length ? [`- ${k}:`, ...v.map((x) => `  - ${x}`)] : [`- ${k}: none`],
      ),
      "seccomp_or_sandbox_clues:",
      ...(seccompClues.length ? seccompClues.map((x) => `- ${x}`) : ["- none"]),
      "file_read_strings:",
      ...(fileReadStrings.length ? fileReadStrings.map((x) => `- ${x}`) : ["- none"]),
      "orw_prerequisite_checks:",
      hasOrwNames
        ? "- open/openat evidence exists; confirm pathname control or writable flag path string."
        : "- open/openat evidence missing; inspect seccomp allowlist or use existing file descriptor route.",
      "- Confirm read buffer is writable and large enough.",
      "- Confirm write/sendfile/readv closure to stdout/socket is allowed.",
      syscallGadgets.length
        ? "- Confirm syscall number and argument register control for target arch."
        : "- Find a syscall/int 0x80/SROP path before choosing pure syscall ORW.",
      "shell_route_checks:",
      "- Use shell only if execve is allowed and /bin/sh plus argument/register constraints are satisfiable.",
      "- If execve is blocked by seccomp or sandbox, stop shell mutation and switch to direct file-read/ORW closure.",
    ].join("\n")
  },
})
