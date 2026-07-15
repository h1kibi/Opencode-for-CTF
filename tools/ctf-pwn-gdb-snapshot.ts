import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

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

function splitSimple(value: string | undefined) {
  return String(value || "").split(/\s+/).filter(Boolean)
}

function parseArgvPrefix(argv: string | undefined, argvPrefixJson: string | undefined) {
  if (argvPrefixJson) {
    const parsed = JSON.parse(argvPrefixJson) as unknown
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) throw new Error("argvPrefixJson must be a JSON string array")
    return parsed as string[]
  }
  return splitSimple(argv)
}

function validateContainerPosixPath(input: string, field: string, options?: { allowRoot?: boolean }) {
  if (!input.startsWith("/")) throw new Error(`${field} must be an absolute POSIX path inside the container`)
  const normalized = path.posix.normalize(input)
  if (!(options?.allowRoot) && normalized === "/") throw new Error(`${field} must not be '/'`)
  return normalized
}

function isInsideContainerTree(child: string, root: string) {
  return child === root || child.startsWith(`${root}/`)
}

function splitArgs(value: string | undefined) {
  return String(value || "").split(/\s+/).filter(Boolean).slice(0, 40)
}

function compact(s: string, max = 14000) {
  const clean = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (clean.length <= max) return clean
  const head = clean.slice(0, Math.floor(max * 0.65))
  const tail = clean.slice(clean.length - Math.floor(max * 0.35))
  return `${head}\n...[truncated ${clean.length - max} chars]...\n${tail}`
}

async function safeExec(cmd: string, args: string[], cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, env })
    return { ok: true, output: `${stdout}${stderr ? `\n${stderr}` : ""}` }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: string | number }
    const merged = `${e.stdout ?? ""}${e.stderr ? `\n${e.stderr}` : ""}${e.message ? `\n${e.message}` : ""}`
    return { ok: false, output: merged || String(e.code ?? "gdb execution failed") }
  }
}

function parseRegisters(text: string) {
  return text.split(/\r?\n/).filter((line) => /^([a-z]{2,4}|eip|rip|rsp|rbp|esp|ebp)\s+0x[0-9a-f]+/i.test(line.trim())).slice(0, 32)
}

function parseBacktrace(text: string) {
  return text.split(/\r?\n/).filter((line) => /^#\d+\s+/.test(line.trim())).slice(0, 12)
}

function parseStack(text: string) {
  return text.split(/\r?\n/).filter((line) => /^0x[0-9a-f]+:/i.test(line.trim())).slice(0, 24)
}

function parseMappings(text: string) {
  const start = text.indexOf("process mappings:")
  if (start < 0) return []
  return text.slice(start).split(/\r?\n/).slice(1).filter((line) => /^0x[0-9a-f]+\s+0x[0-9a-f]+/i.test(line.trim())).slice(0, 24)
}

function extractPieBase(mappings: string[]) {
  for (const line of mappings) {
    const m = line.match(/^(0x[0-9a-f]+)\s+0x[0-9a-f]+\s+0x[0-9a-f]+\s+0x[0-9a-f]+\s+([^\s].*)$/i)
    if (!m) continue
    const start = m[1]
    const label = (m[2] || "").trim().toLowerCase()
    if (label.includes("/")) return start
  }
  return ""
}

function extractNamedMapBase(mappings: string[], keyword: string) {
  const lowerKeyword = keyword.toLowerCase()
  for (const line of mappings) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    if ((parts.slice(4).join(" ") || "").toLowerCase().includes(lowerKeyword)) return parts[0]
  }
  return ""
}

function parseOffsetSpecs(value: string | undefined) {
  return String(value || "")
    .split(/[\r\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function parseMemoryBlocks(text: string) {
  const lines = text.split(/\r?\n/)
  const blocks: string[] = []
  let current: string[] = []
  let capture = false
  for (const line of lines) {
    if (/^memory_view\[/.test(line)) {
      if (current.length) blocks.push(current.join("\n"))
      current = [line]
      capture = true
      continue
    }
    if (capture) {
      if (/^0x[0-9a-f]+:/i.test(line) || /^\$\d+\s*=/.test(line) || /^Cannot access memory/i.test(line) || /^No registers\./i.test(line)) {
        current.push(line)
        continue
      }
      if (!line.trim()) continue
      blocks.push(current.join("\n"))
      current = []
      capture = false
    }
  }
  if (current.length) blocks.push(current.join("\n"))
  return blocks.slice(0, 12)
}

function classifySignal(text: string) {
  const lower = text.toLowerCase()
  if (/sigsegv|segmentation fault|program received signal sigsegv/.test(lower)) return "SIGSEGV"
  if (/sigabrt|abort/.test(lower)) return "SIGABRT"
  if (/sigill|illegal instruction/.test(lower)) return "SIGILL"
  if (/sigbus|bus error/.test(lower)) return "SIGBUS"
  if (/exited normally|inferior .* exited normally/.test(lower)) return "EXITED_NORMALLY"
  if (/exited with code/.test(lower)) return "EXITED_WITH_CODE"
  return "UNKNOWN"
}

function classifyTerminationState(text: string, context: { thenContinueToCrash: boolean; breakpointCount: number }) {
  const lower = text.toLowerCase()
  const hitBreakpoint = /breakpoint \d+,/.test(lower)
  const noRegisters = /the program has no registers now|no current process/i.test(lower)
  const exitedNormally = /exited normally|inferior .* exited normally/.test(lower)
  const exitedWithCode = /exited with code/.test(lower)
  if (hitBreakpoint && exitedNormally && context.thenContinueToCrash) return "exited_after_continue"
  if (hitBreakpoint && exitedWithCode && context.thenContinueToCrash) return "exited_with_code_after_continue"
  if (hitBreakpoint && noRegisters) return "breakpoint_hit_then_process_gone"
  if (!hitBreakpoint && exitedNormally && context.breakpointCount > 0) return "exited_normally_before_breakpoint"
  if (!hitBreakpoint && exitedWithCode && context.breakpointCount > 0) return "exited_with_code_before_breakpoint"
  if (hitBreakpoint) return "breakpoint_hit"
  if (exitedNormally) return "exited_normally"
  if (exitedWithCode) return "exited_with_code"
  return "unknown"
}

function extractIpRegister(registers: string[]) {
  const line = registers.find((x) => /^(rip|eip)\s+/i.test(x.trim())) || ""
  const m = line.match(/^(rip|eip)\s+(0x[0-9a-f]+)/i)
  return { line, reg: m?.[1] || "", value: m?.[2] || "" }
}

function inferHints(text: string, ipValue: string, pieBase: string) {
  const lower = text.toLowerCase()
  const hints: string[] = []
  if (/movaps|alignment/i.test(text)) hints.push("possible_stack_alignment_issue")
  if (/cannot access memory/i.test(lower)) hints.push("invalid_pointer_or_unmapped_access")
  if (/__stack_chk_fail|stack smashing/i.test(lower)) hints.push("canary_or_stack_smash_detected")
  if (/execve|seccomp|sandbox/i.test(lower)) hints.push("seccomp_or_execve_related_context")
  if (/0x41414141|0x61616161|0x4141414141414141|0x6161616161616161/i.test(ipValue)) hints.push("instruction_pointer_looks_pattern_or_filler_controlled")
  if (pieBase) hints.push("pie_base_guess_available")
  if (/main\+|__libc_start_main|puts@plt|system@plt|print_flag|win/i.test(lower)) hints.push("symbolic_route_context_present")
  return hints.length ? hints : ["collect more control/leak context from this snapshot"]
}

function parseSimpleList(value: string | undefined, limit = 12) {
  return String(value || "")
    .split(/[\r\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function parseKeyValueList(value: string | undefined, limit = 12) {
  return parseSimpleList(value, limit)
    .map((item) => {
      const idx = item.indexOf("=")
      if (idx < 1) return null
      return { key: item.slice(0, idx).trim(), value: item.slice(idx + 1).trim() }
    })
    .filter(Boolean) as Array<{ key: string; value: string }>
}

function hexToGdbByteArray(hexText: string) {
  const cleaned = hexText.replace(/[^0-9a-fA-F]/g, "")
  const bytes = cleaned.match(/../g) || []
  return { count: Math.max(1, bytes.length), init: `{${(bytes.length ? bytes : ["00"]).map((b) => `0x${b}`).join(", ")}}` }
}

function patchMemoryExpression(expr: string, hexText: string) {
  const encoded = hexToGdbByteArray(hexText)
  return [`printf \"patch_memory: ${expr}=${hexText}\\n\"`, `set {char[${encoded.count}]}(${expr}) = ${encoded.init}`]
}

function pythonRegisterPatch(item: { key: string; value: string }) {
  return [
    "python",
    "import gdb",
    `gdb.execute(${JSON.stringify(`set var $${item.key}=${item.value}`)}, to_string=True)`,
    "end",
  ]
}

async function loadRuntimeProfile(contextDir: string, profileId?: string) {
  if (!profileId) return null as any
  const profilePath = resolveInsideWorkspace(contextDir, `work/pwn-runtime-profiles/${profileId}.json`)
  return JSON.parse(await readFile(profilePath, "utf8"))
}

export default tool({
  description: "CTF pwn gdb snapshot: run a structured non-interactive gdb capture and summarize registers, backtrace, stack, mappings, selected memory views, and optional PIE-relative breakpoint offsets for hard PWN state reduction.",
  args: {
    binary: tool.schema.string().describe("Workspace-relative ELF binary path."),
    mode: tool.schema.string().optional().describe("Input mode: stdin | argv. Default stdin."),
    argv: tool.schema.string().optional().describe("Optional argv prefix for argv mode; payload is appended as final argument if provided."),
    argvPrefixJson: tool.schema.string().optional().describe("Safer argv prefix as JSON string array."),
    stdinPayload: tool.schema.string().optional().describe("Optional exact stdin payload."),
    argvPayload: tool.schema.string().optional().describe("Optional exact argv payload."),
    payloadFile: tool.schema.string().optional().describe("Workspace-relative text/binary payload file used as stdin or argv payload."),
    breakpoints: tool.schema.string().optional().describe("Comma/newline-separated breakpoint specs, e.g. main, *0x40123a."),
    breakpointHitCounts: tool.schema.string().optional().describe("Comma/newline-separated desired hit numbers for the listed breakpoints. 1 means first hit; values >1 are implemented with gdb ignore count."),
    breakpointOffsets: tool.schema.string().optional().describe("Comma/newline-separated PIE-relative text offsets such as 0x1234 or +0x1234. These are added to a detected PIE base after mappings are captured."),
    thenContinueToCrash: tool.schema.boolean().optional().describe("After first capture, continue and auto-capture signal/crash/exit context. Default false."),
    autoBtOnSignal: tool.schema.boolean().optional().describe("Install gdb catch/handle flow to print bt/registers on signal-like stop. Default true when thenContinueToCrash."),
    gdbScriptExtra: tool.schema.string().optional().describe("Extra gdb commands to append after the base snapshot script."),
    memoryExprs: tool.schema.string().optional().describe("Comma/newline-separated memory expressions to inspect, e.g. $rsp, $rbp-0x40, 0x404000."),
    memoryLabels: tool.schema.string().optional().describe("Optional comma/newline-separated labels matching memoryExprs order, e.g. victim,desc_ptr,fd."),
    patchRegisters: tool.schema.string().optional().describe("Comma/newline-separated register=value assignments applied after the first stop, e.g. rip=0x401234,r13=0xdeadbeef."),
    patchMemory: tool.schema.string().optional().describe("Comma/newline-separated expr=hex assignments applied after the first stop, e.g. 0x404000=41414141,$rsp=efbeadde."),
    continueAfterPatch: tool.schema.boolean().optional().describe("Continue once after register/memory patches are applied. Default false."),
    snapshotBeforeContinueLabel: tool.schema.string().optional().describe("Optional label printed before the first snapshot block. Default pre_patch_snapshot."),
    snapshotAfterContinueLabel: tool.schema.string().optional().describe("Optional label printed after continue/patch flow. Default post_patch_snapshot."),
    expectRip: tool.schema.string().optional().describe("Optional exact RIP/EIP value expected in a snapshot, e.g. 0x401234."),
    expectContains: tool.schema.string().optional().describe("Optional substring expected in GDB output for a micro-validation oracle."),
    stackWords: tool.schema.number().optional().describe("Number of quadwords/dwords to dump from stack. Default 24."),
    noInit: tool.schema.boolean().optional().describe("Pass gdb -nx to skip gdbinit/pwndbg for faster, cleaner startup. Default true."),
    quickProfile: tool.schema.string().optional().describe("light | default. light favors fewer extras and lower startup noise."),
    preserveTmp: tool.schema.boolean().optional().describe("Preserve generated input/gdb script files under work/gdb-snapshot for debugging. Default false."),
    timeoutMs: tool.schema.number().optional().describe("Execution timeout in milliseconds. Default 10000."),
    runtimeProfileId: tool.schema.string().optional().describe("Runtime profile id emitted by ctf-pwn-libc-runtime-doctor. Supplies docker defaults when omitted."),
    composeService: tool.schema.string().optional().describe("docker compose service name for exec mode or compose run mode."),
    containerName: tool.schema.string().optional().describe("Explicit container name for docker exec mode."),
    image: tool.schema.string().optional().describe("Docker image for docker run mode when no existing container/service should be used."),
    useComposeRun: tool.schema.boolean().optional().describe("Use 'docker compose run --rm <service>' instead of exec. Default false."),
    containerWorkdir: tool.schema.string().optional().describe("In-container working directory. Default mirrors the mounted workspace path under /work."),
    containerMountRoot: tool.schema.string().optional().describe("Container path where the host workspace is mounted for docker run or compose run mode. Default /work."),
    runArgs: tool.schema.string().optional().describe("Optional extra arguments for docker run or docker compose run, e.g. '--cap-add=SYS_PTRACE --security-opt seccomp=unconfined'."),
  },
  async execute(args, context) {
    const runtimeProfile = await loadRuntimeProfile(context.directory, args.runtimeProfileId)
    const profileDefaults = runtimeProfile?.docker_runner_defaults || {}
    const binary = resolveInsideWorkspace(context.directory, args.binary)
    const cwd = path.dirname(binary)
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 10000, 30000))
    const mode = (args.mode || "stdin").toLowerCase() === "argv" ? "argv" : "stdin"
    const filePayload = args.payloadFile ? await readFile(resolveInsideWorkspace(context.directory, args.payloadFile), "latin1") : undefined
    const stdinPayload = args.stdinPayload ?? filePayload ?? ""
    const argvPayload = args.argvPayload ?? filePayload ?? ""
    const argvParts = [...parseArgvPrefix(args.argv, args.argvPrefixJson), ...(mode === "argv" && argvPayload ? [argvPayload] : [])]
    const stackWords = Math.max(4, Math.min(args.stackWords ?? 24, 96))
    const noInit = args.noInit !== false
    const quickProfile = String(args.quickProfile || "default").toLowerCase()
    const thenContinueToCrash = Boolean(args.thenContinueToCrash)
    const tmpDir = path.join(context.directory, "work", "gdb-snapshot", `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`)
    await mkdir(tmpDir, { recursive: true })
    const inputFile = path.join(tmpDir, "input.txt")
    const gdbScriptFile = path.join(tmpDir, "snapshot.gdb")
    await writeFile(inputFile, stdinPayload, "utf8")

    const breakpoints = String(args.breakpoints || "")
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12)
    const breakpointHitCounts = String(args.breakpointHitCounts || "")
      .split(/[\r\n,]+/)
      .map((x) => Math.max(1, parseInt(x.trim(), 10) || 1))
      .slice(0, breakpoints.length)
    const breakpointOffsets = parseOffsetSpecs(args.breakpointOffsets)
    const memoryExprs = String(args.memoryExprs || "$rsp,$rbp,$rip")
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8)
    const memoryLabels = String(args.memoryLabels || "")
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, memoryExprs.length)
    const patchRegisters = parseKeyValueList(args.patchRegisters, 16)
    const patchMemory = parseKeyValueList(args.patchMemory, 16)
    const continueAfterPatch = Boolean(args.continueAfterPatch)
    const snapshotBeforeContinueLabel = String(args.snapshotBeforeContinueLabel || "pre_patch_snapshot")
    const snapshotAfterContinueLabel = String(args.snapshotAfterContinueLabel || "post_patch_snapshot")

    let runCmd = mode === "argv"
      ? `run ${argvParts.map((x) => JSON.stringify(x)).join(" ")}`
      : stdinPayload || args.payloadFile
        ? `run < ${inputFile}`
        : "run"
    const needsPieOffsetRun = breakpointOffsets.length > 0
    let startCmd = mode === "argv"
      ? `starti ${argvParts.map((x) => JSON.stringify(x)).join(" ")}`
      : stdinPayload || args.payloadFile
        ? `starti < ${inputFile}`
        : "starti"

    const gdbLines = [
      "set pagination off",
      ...(noInit ? ["set auto-load safe-path /"] : []),
      "set confirm off",
      "set print elements 0",
      "set disassemble-next-line off",
      ...breakpoints.map((bp) => `break ${bp}`),
      ...breakpointHitCounts.flatMap((count, idx) => count > 1 ? [`ignore ${idx + 1} ${count - 1}`] : []),
      ...(needsPieOffsetRun ? [startCmd] : [runCmd]),
      "printf \"process mappings:\\n\"",
      "info proc mappings",
      "set $opencode_pie_base = 0",
      `python
import gdb, re
lines = gdb.execute('info proc mappings', to_string=True).splitlines()
base = 0
for line in lines:
    m = re.match(r'^(0x[0-9a-fA-F]+)\\s+0x[0-9a-fA-F]+\\s+0x[0-9a-fA-F]+\\s+0x[0-9a-fA-F]+\\s+(.+)$', line.strip())
    if not m:
        continue
    label = m.group(2).strip()
    if '/' in label:
        base = int(m.group(1), 16)
        break
gdb.execute(f'set $opencode_pie_base = {base}')
print(f'opencode_pie_base: 0x{base:x}')
end`,
      ...breakpointOffsets.flatMap((off, idx) => {
        const parsed = off.replace(/^\+/, "")
        return [
          `printf \"breakpoint_offset[${idx}]: ${parsed}\\n\"`,
          `if $opencode_pie_base != 0`,
          `break *($opencode_pie_base + ${parsed})`,
          "end",
        ]
      }),
      ...(needsPieOffsetRun ? ["continue"] : []),
      `printf \"${snapshotBeforeContinueLabel}:\\n\"`,
      "printf \"register snapshot:\\n\"",
      "info registers",
      "printf \"backtrace snapshot:\\n\"",
      "bt",
      `printf \"stack snapshot:\\n\"`,
      `x/${quickProfile === "light" ? Math.min(stackWords, 12) : stackWords}gx $rsp`,
      ...memoryExprs.flatMap((expr, idx) => {
        const label = memoryLabels[idx] ? ` (${memoryLabels[idx]})` : ""
        return [
          `printf \"memory_view[${idx}]${label}: ${expr}\\n\"`,
          `x/8gx ${expr}`,
        ]
      }),
      ...patchRegisters.map((item, idx) => `printf \"patch_register[${idx}]: ${item.key}=${item.value}\\n\"`),
      ...patchRegisters.flatMap((item) => pythonRegisterPatch(item)),
      ...patchMemory.flatMap((item) => patchMemoryExpression(item.key, item.value)),
      ...((patchRegisters.length || patchMemory.length) && !continueAfterPatch ? [
        "printf \"post_patch_registers:\\n\"",
        "info registers",
      ] : []),
      ...(continueAfterPatch ? [
        "continue",
        `printf \"${snapshotAfterContinueLabel}:\\n\"`,
        "printf \"post_patch_registers:\\n\"",
        "info registers",
        "printf \"post_patch_backtrace:\\n\"",
        "bt",
        "printf \"post_patch_stack:\\n\"",
        "x/24gx $rsp",
      ] : []),
      ...(thenContinueToCrash ? [
        "printf \"continue_to_crash: begin\\n\"",
        "continue",
        "printf \"post_continue_registers:\\n\"",
        "info registers",
        "printf \"post_continue_backtrace:\\n\"",
        "bt",
        "printf \"post_continue_stack:\\n\"",
        "x/24gx $rsp",
      ] : []),
      ...(String(args.gdbScriptExtra || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)),
    ]
    await writeFile(gdbScriptFile, `${gdbLines.join("\n")}\n`, "utf8")

    try {
      const effectiveComposeService = args.composeService || profileDefaults.composeService || ""
      const effectiveRunArgs = args.runArgs || profileDefaults.runArgs || ""
      const hasExecTarget = Boolean(args.containerName) || (Boolean(effectiveComposeService) && !args.useComposeRun)
      const hasRunTarget = Boolean(args.image) || (Boolean(effectiveComposeService) && Boolean(args.useComposeRun))
      let executionSubstrate = "host"
      let invoked = `gdb ${[...(noInit ? ["-nx"] : []), "-q", "-batch", "-x", gdbScriptFile, binary].join(" ")}`
      let result
      if (hasExecTarget || hasRunTarget) {
        const containerMountRoot = validateContainerPosixPath(args.containerMountRoot || profileDefaults.containerMountRoot || "/work", "containerMountRoot")
        const relBinary = path.relative(context.directory, binary).replace(/\\/g, "/")
        const relScript = path.relative(context.directory, gdbScriptFile).replace(/\\/g, "/")
        const relInput = path.relative(context.directory, inputFile).replace(/\\/g, "/")
        const relCwd = path.relative(context.directory, cwd).replace(/\\/g, "/")
        const inContainerBinary = path.posix.join(containerMountRoot, relBinary)
        const inContainerScript = path.posix.join(containerMountRoot, relScript)
        const inContainerInputFile = path.posix.join(containerMountRoot, relInput)
        const defaultContainerWorkdir = !relCwd || relCwd === "." ? containerMountRoot : path.posix.join(containerMountRoot, relCwd)
        const containerWorkdir = args.containerWorkdir || profileDefaults.containerWorkdir ? validateContainerPosixPath(args.containerWorkdir || profileDefaults.containerWorkdir, "containerWorkdir") : defaultContainerWorkdir
        if (hasRunTarget && !isInsideContainerTree(containerWorkdir, containerMountRoot)) {
          throw new Error(`containerWorkdir must stay under containerMountRoot for run mode: ${containerWorkdir} is outside ${containerMountRoot}`)
        }
        runCmd = mode === "argv"
          ? `run ${argvParts.map((x) => JSON.stringify(x)).join(" ")}`
          : stdinPayload || args.payloadFile
            ? `run < ${inContainerInputFile}`
            : "run"
        startCmd = mode === "argv"
          ? `starti ${argvParts.map((x) => JSON.stringify(x)).join(" ")}`
          : stdinPayload || args.payloadFile
            ? `starti < ${inContainerInputFile}`
            : "starti"
        await writeFile(gdbScriptFile, `${[
          "set pagination off",
          ...(noInit ? ["set auto-load safe-path /"] : []),
          "set confirm off",
          "set print elements 0",
          "set disassemble-next-line off",
          ...breakpoints.map((bp) => `break ${bp}`),
          ...breakpointHitCounts.flatMap((count, idx) => count > 1 ? [`ignore ${idx + 1} ${count - 1}`] : []),
          ...(needsPieOffsetRun ? [startCmd] : [runCmd]),
          "printf \"process mappings:\\n\"",
          "info proc mappings",
          "set $opencode_pie_base = 0",
          `python
import gdb, re
lines = gdb.execute('info proc mappings', to_string=True).splitlines()
base = 0
for line in lines:
    m = re.match(r'^(0x[0-9a-fA-F]+)\\s+0x[0-9a-fA-F]+\\s+0x[0-9a-fA-F]+\\s+0x[0-9a-fA-F]+\\s+(.+)$', line.strip())
    if not m:
        continue
    label = m.group(2).strip()
    if '/' in label:
        base = int(m.group(1), 16)
        break
gdb.execute(f'set $opencode_pie_base = {base}')
print(f'opencode_pie_base: 0x{base:x}')
end`,
          ...breakpointOffsets.flatMap((off, idx) => {
            const parsed = off.replace(/^\+/, "")
            return [
              `printf \"breakpoint_offset[${idx}]: ${parsed}\\n\"`,
              `if $opencode_pie_base != 0`,
              `break *($opencode_pie_base + ${parsed})`,
              "end",
            ]
          }),
          ...(needsPieOffsetRun ? ["continue"] : []),
          `printf \"${snapshotBeforeContinueLabel}:\\n\"`,
          "printf \"register snapshot:\\n\"",
          "info registers",
          "printf \"backtrace snapshot:\\n\"",
          "bt",
          `printf \"stack snapshot:\\n\"`,
          `x/${quickProfile === "light" ? Math.min(stackWords, 12) : stackWords}gx $rsp`,
          ...memoryExprs.flatMap((expr, idx) => {
            const label = memoryLabels[idx] ? ` (${memoryLabels[idx]})` : ""
            return [
              `printf \"memory_view[${idx}]${label}: ${expr}\\n\"`,
              `x/8gx ${expr}`,
            ]
          }),
          ...patchRegisters.map((item, idx) => `printf \"patch_register[${idx}]: ${item.key}=${item.value}\\n\"`),
          ...patchRegisters.flatMap((item) => pythonRegisterPatch(item)),
          ...patchMemory.flatMap((item) => patchMemoryExpression(item.key, item.value)),
          ...((patchRegisters.length || patchMemory.length) && !continueAfterPatch ? [
            "printf \"post_patch_registers:\\n\"",
            "info registers",
          ] : []),
          ...(continueAfterPatch ? [
            "continue",
            `printf \"${snapshotAfterContinueLabel}:\\n\"`,
            "printf \"post_patch_registers:\\n\"",
            "info registers",
            "printf \"post_patch_backtrace:\\n\"",
            "bt",
            "printf \"post_patch_stack:\\n\"",
            "x/24gx $rsp",
          ] : []),
          ...(thenContinueToCrash ? [
            "printf \"continue_to_crash: begin\\n\"",
            "continue",
            "printf \"post_continue_registers:\\n\"",
            "info registers",
            "printf \"post_continue_backtrace:\\n\"",
            "bt",
            "printf \"post_continue_stack:\\n\"",
            "x/24gx $rsp",
          ] : []),
          ...(String(args.gdbScriptExtra || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)),
        ].join("\n")}\n`, "utf8")
        const gdbArgs = [...(noInit ? ["-nx"] : []), "-q", "-batch", "-x", inContainerScript, inContainerBinary]
        const runArgs = splitArgs(effectiveRunArgs)
        if (args.containerName) {
          executionSubstrate = "docker_exec"
          const dockerArgs = ["exec", args.containerName, "gdb", ...gdbArgs]
          invoked = `docker ${dockerArgs.join(" ")}`
          result = await safeExec("docker", dockerArgs, context.directory, timeoutMs)
        } else if (effectiveComposeService && !args.useComposeRun) {
          executionSubstrate = "compose_exec"
          const dockerArgs = ["compose", "exec", "-T", effectiveComposeService, "gdb", ...gdbArgs]
          invoked = `docker ${dockerArgs.join(" ")}`
          result = await safeExec("docker", dockerArgs, context.directory, timeoutMs)
        } else if (effectiveComposeService && args.useComposeRun) {
          executionSubstrate = "compose_run"
          const dockerArgs = ["compose", "run", "--rm", "-T", ...runArgs, effectiveComposeService, "gdb", ...gdbArgs]
          invoked = `docker ${dockerArgs.join(" ")}`
          result = await safeExec("docker", dockerArgs, context.directory, timeoutMs)
        } else {
          executionSubstrate = "docker_run"
          const dockerArgs = [
            "run",
            "--rm",
            "-v",
            `${context.directory.replace(/\\/g, "/")}:${containerMountRoot}`,
            "-w",
            containerWorkdir,
            ...runArgs,
            String(args.image),
            "gdb",
            ...gdbArgs,
          ]
          invoked = `docker ${dockerArgs.join(" ")}`
          result = await safeExec("docker", dockerArgs, context.directory, timeoutMs)
        }
      } else {
        result = await safeExec("gdb", [...(noInit ? ["-nx"] : []), "-q", "-batch", "-x", gdbScriptFile, binary], cwd, timeoutMs)
      }
      const text = result.output
      if (!text.trim()) {
        return [
          "pwn_gdb_snapshot:",
          `binary: ${binary}`,
          `execution_substrate: ${executionSubstrate}`,
          "status: no_output",
          "recommended_next:",
          "- Check whether gdb is installed and whether the target binary runs in the current environment.",
        ].join("\n")
      }

      if (!result.ok && /not recognized|no such file|cannot find|is not installed/i.test(text.toLowerCase())) {
        return [
          "pwn_gdb_snapshot:",
          `binary: ${binary}`,
          `execution_substrate: ${executionSubstrate}`,
          "status: gdb_unavailable",
          "recommended_next:",
          executionSubstrate === "host"
            ? "- Run ctf-pwn-check-env and prefer Docker pwnlab or a Linux environment before relying on debugger-state automation."
            : "- The selected container substrate does not expose gdb cleanly; verify the same image/service with ctf-pwn-container-probe or switch to a known-good pwnlab image.",
          "invoked:",
          `- ${invoked}`,
          "output_compact:",
          compact(text, 6000),
        ].join("\n")
      }

      const registers = parseRegisters(text)
      const backtrace = parseBacktrace(text)
      const stack = parseStack(text)
      const mappings = parseMappings(text)
      const pieBase = extractPieBase(mappings)
      const libcBase = extractNamedMapBase(mappings, "libc")
      const memoryViews = parseMemoryBlocks(text)
      const signal = classifySignal(text)
      const terminationState = classifyTerminationState(text, { thenContinueToCrash, breakpointCount: breakpoints.length })
      const ip = extractIpRegister(registers)
      const hints = inferHints(text, ip.value, pieBase)
      const expectRipMatched = args.expectRip ? String(ip.value).toLowerCase() === String(args.expectRip).toLowerCase() : null
      const expectContainsMatched = args.expectContains ? text.includes(String(args.expectContains)) : null

      return [
        "pwn_gdb_snapshot:",
        `binary: ${binary}`,
        `execution_substrate: ${executionSubstrate}`,
        `tmp_dir: ${args.preserveTmp ? tmpDir : "ephemeral"}`,
        `gdb_script_file: ${args.preserveTmp ? gdbScriptFile : "ephemeral"}`,
        `runtime_profile_id: ${args.runtimeProfileId || ""}`,
        `invoked: ${invoked}`,
        `input_mode: ${mode}`,
        `custom_payload: ${args.stdinPayload || args.argvPayload || args.payloadFile ? "true" : "false"}`,
        `payload_file: ${args.payloadFile || "none"}`,
        `breakpoint_count: ${breakpoints.length}`,
        `breakpoint_hit_counts: ${breakpointHitCounts.join(",") || "none"}`,
        `breakpoint_offset_count: ${breakpointOffsets.length}`,
        `pie_offset_mode: ${needsPieOffsetRun ? "starti_then_continue" : "disabled"}`,
        `pie_base_guess: ${pieBase || "unknown"}`,
        `libc_base_guess: ${libcBase || "unknown"}`,
        `memory_expr_count: ${memoryExprs.length}`,
        `patch_register_count: ${patchRegisters.length}`,
        `patch_memory_count: ${patchMemory.length}`,
        `continue_after_patch: ${continueAfterPatch}`,
        `expect_rip: ${args.expectRip || "none"}`,
        `expect_rip_matched: ${expectRipMatched === null ? "n/a" : expectRipMatched}`,
        `expect_contains: ${args.expectContains || "none"}`,
        `expect_contains_matched: ${expectContainsMatched === null ? "n/a" : expectContainsMatched}`,
        `gdb_no_init: ${noInit}`,
        `quick_profile: ${quickProfile}`,
        `signal_class: ${signal}`,
        `termination_state: ${terminationState}`,
        `ip_register: ${ip.reg || "unknown"}`,
        `ip_value: ${ip.value || "unknown"}`,
        `register_count: ${registers.length}`,
        `backtrace_count: ${backtrace.length}`,
        `stack_line_count: ${stack.length}`,
        `mapping_count: ${mappings.length}`,
        "hint_summary:",
        ...hints.map((x) => `- ${x}`),
        "registers:",
        ...(registers.length ? registers.map((x) => `- ${x}`) : ["- none"]),
        "backtrace:",
        ...(backtrace.length ? backtrace.map((x) => `- ${x}`) : ["- none"]),
        "stack_sample:",
        ...(stack.length ? stack.map((x) => `- ${x}`) : ["- none"]),
        "mapping_sample:",
        ...(mappings.length ? mappings.map((x) => `- ${x}`) : ["- none"]),
        "memory_views:",
        ...(memoryViews.length ? memoryViews.flatMap((block) => block.split(/\r?\n/).map((line, idx) => idx === 0 ? `- ${line}` : `  - ${line}`)) : ["- none"]),
        "recommended_next:",
        signal === "SIGSEGV"
          ? "- Use this snapshot to confirm whether the current branch is a control problem, an alignment problem, or an invalid-address/base problem before mutating payload family."
          : terminationState === "exited_normally_before_breakpoint" || terminationState === "exited_after_continue"
            ? "- Treat normal program exit as a valid terminal observation here; compare whether the breakpoint/continue plan or payload length should change before assuming exploit failure."
          : "- Compare this snapshot against the previous phase only if one variable changed; do not branch on debugger noise alone.",
        "output_compact:",
        compact(text),
      ].join("\n")
    } finally {
      if (!args.preserveTmp) await rm(tmpDir, { recursive: true, force: true })
    }
  },
})
