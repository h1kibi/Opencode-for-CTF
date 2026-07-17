import { tool } from "@opencode-ai/plugin"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  return target
}

function cyclic(length: number) {
  const sets = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789"]
  let out = ""
  outer: for (const a of sets[0])
    for (const b of sets[1])
      for (const c of sets[2]) {
        out += a + b + c
        if (out.length >= length) break outer
      }
  return out.slice(0, length)
}

function hexToAsciiLittle(hex: string, widthBytes: number) {
  const clean = hex.replace(/^0x/i, "").padStart(widthBytes * 2, "0")
  const bytes = clean.match(/../g) || []
  return bytes
    .reverse()
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join("")
}

function findOffset(pattern: string, value: string, bitsGuess: 32 | 64) {
  const widths = bitsGuess === 64 ? [8, 4] : [4]
  for (const w of widths) {
    const needle = hexToAsciiLittle(value, w)
    const idx = pattern.indexOf(needle)
    if (idx >= 0) return { offset: idx, width: w }
  }
  return { offset: -1, width: 0 }
}

function parseArgvPrefix(argv: string | undefined, argvPrefixJson: string | undefined) {
  if (argvPrefixJson) {
    const parsed = JSON.parse(argvPrefixJson) as unknown
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string"))
      throw new Error("argvPrefixJson must be a JSON string array")
    return parsed as string[]
  }
  return argv ? argv.split(/\s+/).filter(Boolean) : []
}

async function runGdb(
  binary: string,
  inputFile: string,
  cwd: string,
  timeoutMs: number,
  mode: string,
  argvParts: string[],
) {
  const runCommand = mode === "argv" ? `run ${argvParts.map((x) => JSON.stringify(x)).join(" ")}` : `run < ${inputFile}`
  const args = ["-q", "-batch", "-ex", runCommand, "-ex", "info registers", "-ex", "bt", "-ex", "x/24gx $rsp", binary]
  const { stdout, stderr } = await safeExecWithStreams("gdb", args, { cwd, timeoutMs, maxBuffer: 1024 * 1024 })
  return `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`
}

export default tool({
  description: "CTF pwn crash probe: run one cyclic-input gdb batch probe and report crash/control/offset hints.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative binary path."),
    length: tool.schema.number().optional().describe("Cyclic pattern length. Default 400."),
    mode: tool.schema.string().optional().describe("Input mode: stdin | argv. Default stdin."),
    argv: tool.schema
      .string()
      .optional()
      .describe("Optional argv prefix for argv mode; cyclic pattern is appended as the final argument."),
    argvPrefixJson: tool.schema
      .string()
      .optional()
      .describe('Safer argv prefix as JSON string array, e.g. ["--name","value with spaces"]. Overrides argv.'),
    stdinPayload: tool.schema.string().optional().describe("Optional exact stdin payload instead of cyclic pattern."),
    argvPayload: tool.schema
      .string()
      .optional()
      .describe("Optional exact argv payload instead of cyclic pattern for argv mode."),
    payloadFile: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative text/binary payload file. Used as stdinPayload or argvPayload depending on mode."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 8000."),
  },
  async execute(args, context) {
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const cwd = path.dirname(binary)
    const length = Math.max(64, Math.min(args.length ?? 400, 4096))
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 8000, 30000))
    const mode = (args.mode || "stdin").toLowerCase() === "argv" ? "argv" : "stdin"
    const generatedPattern = cyclic(length)
    const filePayload = args.payloadFile
      ? await readFile(resolveInsideWorkspace(context.directory, args.payloadFile), "latin1")
      : undefined
    const pattern =
      mode === "argv"
        ? (args.argvPayload ?? filePayload ?? generatedPattern)
        : (args.stdinPayload ?? filePayload ?? generatedPattern)
    const stdinPayload = args.stdinPayload ?? filePayload ?? generatedPattern
    const argvFinalPayload = args.argvPayload ?? filePayload ?? generatedPattern
    const argvParts = [...parseArgvPrefix(args.argv, args.argvPrefixJson), argvFinalPayload]
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "pwn-crash-probe-"))
    const inputFile = path.join(tmpDir, "pattern.txt")
    await writeFile(inputFile, `${stdinPayload}\n`, "utf8")
    try {
      const gdbOut = await runGdb(binary, inputFile, cwd, timeoutMs, mode, argvParts)
      const bitsGuess: 32 | 64 = /x86-64|64-bit|rax|rip|rsp/i.test(gdbOut) ? 64 : 32
      const regLine = gdbOut.split(/\r?\n/).find((x) => /\b(rip|eip)\b/i.test(x)) || ""
      const regMatch = regLine.match(/\b(?:rip|eip)\b\s+0x([0-9a-f]+)/i)
      const value = regMatch ? `0x${regMatch[1]}` : ""
      const found = value ? findOffset(pattern, value, bitsGuess) : { offset: -1, width: 0 }
      const crash = /sigsegv|segmentation fault|program received signal/i.test(gdbOut)
      const control = found.offset >= 0
      const topRegs = gdbOut
        .split(/\r?\n/)
        .filter((x) => /\b(rip|eip|rsp|esp|rbp|ebp|rax|eax)\b/i.test(x))
        .slice(0, 10)
      const backtrace = gdbOut
        .split(/\r?\n/)
        .filter((x) => /^#\d+/.test(x))
        .slice(0, 8)
      const stack = gdbOut
        .split(/\r?\n/)
        .filter((x) => /^0x[0-9a-f]+:/i.test(x))
        .slice(0, 12)
      return [
        "pwn_crash_probe:",
        `binary: ${binary}`,
        `input_mode: ${mode}`,
        `custom_payload: ${args.stdinPayload || args.argvPayload || args.payloadFile ? "true" : "false"}`,
        `payload_file: ${args.payloadFile || "none"}`,
        `argv_prefix_count: ${argvParts.length - 1}`,
        `pattern_length: ${length}`,
        `bits_guess: ${bitsGuess}`,
        `crash_detected: ${crash}`,
        `ip_register_value: ${value || "unknown"}`,
        `ip_controlled: ${control}`,
        `offset_hint: ${found.offset >= 0 ? found.offset : "unknown"}`,
        `offset_width_bytes: ${found.width || "unknown"}`,
        "recommended_next:",
        control
          ? "- RIP/EIP looks pattern-derived; move to ret2win/ROP/leak planning with this offset."
          : "- Control not yet proven; inspect protocol, input length, newline handling, and crash site before building ROP.",
        "registers:",
        ...(topRegs.length ? topRegs.map((x) => `- ${x}`) : ["- none"]),
        "backtrace:",
        ...(backtrace.length ? backtrace.map((x) => `- ${x}`) : ["- none"]),
        "stack_sample:",
        ...(stack.length ? stack.map((x) => `- ${x}`) : ["- none"]),
      ].join("\n")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  },
})
