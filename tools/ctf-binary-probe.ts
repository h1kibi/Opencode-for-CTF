import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, lstat, open } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { buildGoExecutionPlan, buildGoHelperChains, buildGoPivotHints, classifyGoFunctions, collectGoNameCandidates, detectGoFromStrings, findGopclntabOffsets, parseElfSections, parseGoPclntab, type GoPclnFunction } from "./lib/go-elf-analysis.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}


const execFile = promisify(execFileCb)
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g
const INTERESTING_RE = /\b(win|flag|shell|system|execve|gets|scanf|printf|puts|read|write|open|openat|sendfile|strcpy|strcat|sprintf|memcpy|malloc|free|realloc|mprotect|mmap|seccomp|canary|libc|\/bin\/sh)\b/i
const DANGEROUS_IMPORT_RE = /\b(gets|scanf|printf|sprintf|strcpy|strcat|memcpy|read|write|open|openat|sendfile|system|execve|mprotect|mmap|malloc|free|realloc|setvbuf|alarm)\b/i
type BoolUnknown = boolean | "unknown"
type PackerVerdict = "none" | "upx" | "generic"
const DOCKER_PROBE_IMAGE = "pwnlab:general-ubuntu22.04"
const WINDOWS_WRAPPERS: Record<string, string[]> = {
  file: ["file.cmd"],
  checksec: ["checksec.cmd"],
  readelf: ["readelf.cmd"],
  nm: ["nm.cmd"],
  objdump: ["objdump.cmd"],
  strings: ["strings.cmd"],
  gdb: ["gdb.cmd"],
}

async function resolveExec(cmd: string) {
  if (process.platform !== "win32") return cmd
  const userBin = path.join(process.env.USERPROFILE || "C:\\Users\\Administrator", "bin")
  const wrapperNames = WINDOWS_WRAPPERS[cmd] ?? []
  for (const wrapper of wrapperNames) {
    const candidate = path.join(userBin, wrapper)
    try {
      await access(candidate)
      return candidate
    } catch {
      // continue
    }
  }
  return cmd
}

async function safeExec(cmd: string, args: string[], cwd: string, ms = 6000) {
  try {
    const resolved = await resolveExec(cmd)
    const { stdout, stderr } = await execFile(resolved, args, { cwd, timeout: ms, maxBuffer: 1024 * 1024 })
    const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    return out || "<no output>"
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}`.trim()
    return out || `<failed: ${e.message ?? String(err)}>`
  }
}

function isFailureOutput(text: string) {
  return /^<failed:/i.test(text.trim())
}

function shellQuote(value: string) {
  return JSON.stringify(value)
}

async function safeExecDocker(workspaceRoot: string, workspaceFile: string, shellCommand: string, ms = 12000) {
  const containerWorkdir = "/work"
  const mountedRoot = workspaceRoot.replace(/\\/g, "/")
  const rel = path.relative(workspaceRoot, workspaceFile).replace(/\\/g, "/")
  const targetInContainer = `${containerWorkdir}/${rel}`
  const command = shellCommand.replaceAll("__TARGET__", targetInContainer)
  try {
    const { stdout, stderr } = await execFile("docker", [
      "run",
      "--rm",
      "-v",
      `${mountedRoot}:${containerWorkdir}`,
      "-w",
      containerWorkdir,
      DOCKER_PROBE_IMAGE,
      "bash",
      "-lc",
      command,
    ], { cwd: workspaceRoot, timeout: ms, maxBuffer: 2 * 1024 * 1024 })
    const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    return out || "<no output>"
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}`.trim()
    return out || `<failed: ${e.message ?? String(err)}>`
  }
}

async function sha256File(target: string) {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(target)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve())
    stream.on("error", reject)
  })
  return hash.digest("hex")
}

async function readHeadSample(target: string, maxBytes: number) {
  const fh = await open(target, "r")
  try {
    const out = Buffer.allocUnsafe(maxBytes)
    const { bytesRead } = await fh.read(out, 0, maxBytes, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

function printableStrings(buf: Buffer) {
  return Array.from(buf.toString("latin1").matchAll(/[ -~]{4,}/g), (m) => m[0])
}

function grepLines(text: string, re: RegExp, limit = 40) {
  return text.split(/\r?\n/).filter((line) => re.test(line)).slice(0, limit)
}

function firstMatch(text: string, re: RegExp) {
  return text.match(re)?.[1]?.trim() ?? "unknown"
}

function yn(v: BoolUnknown) {
  return typeof v === "boolean" ? (v ? "yes" : "no") : v
}

function packerSignals(sample: Buffer, strings: string[], fileOut: string, readelfHeader: string, readelfNotes: string) {
  const text = `${fileOut}\n${readelfHeader}\n${readelfNotes}\n${strings.join("\n")}`
  const lower = text.toLowerCase()
  const upxSignals = [
    /\bupx!\b/i.test(text) ? "UPX! marker" : "",
    /\bupx0\b|\bupx1\b|\bupx2\b/i.test(text) ? "UPX section names" : "",
    /packed by upx/i.test(text) ? "packed by upx string" : "",
  ].filter(Boolean)
  const genericSignals = [
    /no section headers|no section header/i.test(lower) ? "missing section headers" : "",
    /not stripped/.test(lower) ? "" : "",
    /mprotect|virtualprotect|writeprocessmemory|self-modifying|unpack/i.test(lower) ? "runtime code-write/unpack clue" : "",
  ].filter(Boolean)
  const verdict: PackerVerdict = upxSignals.length ? "upx" : genericSignals.length ? "generic" : "none"
  const confidence = upxSignals.length >= 2 ? "high" : upxSignals.length === 1 || genericSignals.length >= 2 ? "medium" : genericSignals.length === 1 ? "low" : "none"
  return {
    verdict,
    confidence,
    signals: [...upxSignals, ...genericSignals].slice(0, 8),
    likelyPacked: verdict !== "none",
    sectionHeaderGap: /no section headers|no section header/i.test(lower) ? "yes" : "no",
    sampleMagic: sample.subarray(0, 4).toString("latin1"),
  }
}

function parseMitigations(fileOut: string, checksecOut: string, readelfHeader: string, lddOut: string, combined: string) {
  const fileLower = fileOut.toLowerCase()
  const checkLower = checksecOut.toLowerCase()
  const headerLower = readelfHeader.toLowerCase()
  const arch = firstMatch(readelfHeader, /Machine:\s*(.+)/i)
  const bits = /elf64|class:\s*elf64|64-bit/.test(`${fileLower}\n${headerLower}`) ? "64" : /elf32|class:\s*elf32|32-bit/.test(`${fileLower}\n${headerLower}`) ? "32" : "unknown"
  const nx: BoolUnknown = /nx\s+enabled|nx:\s*enabled|noexecstack/.test(checkLower) ? true : /nx\s+disabled|nx:\s*disabled|execstack/.test(checkLower) ? false : "unknown"
  const pie: BoolUnknown = /pie\s+enabled|pie:\s*enabled|\bpie\b/.test(checkLower) && !/no pie|pie\s+disabled|pie:\s*disabled/.test(checkLower) ? true : /no pie|pie\s+disabled|pie:\s*disabled/.test(checkLower) ? false : /type:\s*dyn/.test(headerLower) ? true : /type:\s*exec/.test(headerLower) ? false : "unknown"
  const canary: BoolUnknown = /no canary|canary\s+disabled|canary:\s*disabled/.test(checkLower) ? false : /(^|\b)canary\s+found|stack canary\s+found|canary:\s*enabled/.test(checkLower) ? true : "unknown"
  const relro = /full relro/.test(checkLower) ? "full" : /partial relro/.test(checkLower) ? "partial" : /no relro/.test(checkLower) ? "none" : "unknown"
  const stripped: BoolUnknown = /not stripped/.test(fileLower) ? false : /stripped/.test(fileLower) ? true : "unknown"
  const staticLinked = /statically linked/.test(fileLower) || /not a dynamic executable/.test(lddOut.toLowerCase())
  const interpreter = firstMatch(combined, /interpreter:\s*([^\n]+)/i) !== "unknown" ? firstMatch(combined, /interpreter:\s*([^\n]+)/i) : firstMatch(readelfHeader, /Requesting program interpreter:\s*([^\]]+)/i)
  const glibc = firstMatch(lddOut, /libc\.so\.6\s*=>\s*([^\s]+)/i)
  const cetIbt = /ibt|endbr64|endbr32|cet|shadow stack|shstk/.test(combined) ? "clue" : "unknown"
  const seccomp = /seccomp|prctl|seccomp-tools|strict mode|filter mode/.test(combined) ? "clue" : "unknown"
  return { arch, bits, nx, pie, canary, relro, stripped, staticLinked, interpreter, glibc, cetIbt, seccomp }
}

function routeSeeds(m: ReturnType<typeof parseMitigations>, combined: string, symbolHits: string[], interestingStrings: string[]) {
  const seeds: string[] = []
  const hasWin = /\b(win|print_flag|flag|backdoor)\b/i.test(`${symbolHits.join("\n")}\n${interestingStrings.join("\n")}`)
  const hasFmt = /printf|fprintf|sprintf|format/.test(combined)
  const hasHeap = /malloc|free|realloc|tcache|fastbin|unsorted|heap|uaf|double free/.test(combined)
  const hasSystemBinsh = /system|\/bin\/sh/.test(combined)
  const hasVmDispatcher = /opcode|handler|dispatch|jump table|\btable\b|op_load|op_store|op_bounds|run_vm|bytecode/.test(combined)
  if (hasWin && m.pie === false) seeds.push("ret2win_candidate: fixed win/flag-like symbol; prove offset/control then call direct symbol")
  if (m.canary === false && m.nx === true && (m.pie === false || hasSystemBinsh)) seeds.push("ret2libc_or_rop_candidate: prove RIP control, leak libc if needed, check stack alignment")
  if (m.nx === false && m.canary === false) seeds.push("shellcode_candidate: NX disabled; still check bad chars/input transform/seccomp")
  if (hasFmt) seeds.push("format_candidate: build read-only offset/leak map before %n writes")
  if (hasHeap) seeds.push("heap_candidate: build menu state table, allocator/libc version, chunk layout, primitive proof")
  if (m.seccomp === "clue") seeds.push("seccomp_orw_candidate: inspect syscall allowlist before shell; consider ORW/SROP/syscall ROP")
  if (m.staticLinked) seeds.push("static_syscall_rop_candidate: static binary; prefer embedded gadgets/syscall ROP over libc leak")
  if (hasVmDispatcher) seeds.unshift("vm_dispatch_candidate: custom dispatcher/opcode/handler evidence present; prioritize handler reduction, state-slot mapping, and bounds/OOB analysis before classic ret2libc closure")
  if (!seeds.length) seeds.push("primitive_discovery: model protocol, reproduce crash/oracle, then choose leak/write/control route")
  return seeds.slice(0, 8)
}

function detectLanguageRuntime(fileOut: string, strings: string[]) {
  const joined = `${fileOut}\n${strings.join("\n")}`
  const goBase = detectGoFromStrings(strings)
  const rustSignals = [
    /core::panicking::panic/i.test(joined) ? "core::panicking::panic" : "",
    /\.rustc/i.test(joined) ? ".rustc" : "",
    /_zn[0-9a-z_]+/i.test(joined) ? "mangled-rust-symbols" : "",
  ].filter(Boolean)
  const runtime = goBase.runtime === "go"
    ? "go"
    : rustSignals.length >= 2
      ? "rust"
      : "unknown"
  return { runtime, goSignals: goBase.goSignals, rustSignals, goFunctionNameHits: goBase.functionNameHits }
}

export default tool({
  description: "CTF binary probe: compact one-shot file/checksec/readelf/nm/strings summary for pwn/rev routing before manual command sequences.",
  args: {
    target: tool.schema.string().describe("Binary file path to probe"),
    maxStrings: tool.schema.number().optional().describe("Maximum interesting strings to return. Default 60."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const cwd = path.dirname(target)
    const base = path.basename(target)
    const stat = await lstat(target)
    const sample = await readHeadSample(target, Math.min(stat.size, 2 * 1024 * 1024))
    const whole = stat.size <= 64 * 1024 * 1024 ? await readHeadSample(target, stat.size) : sample
    const isElf = sample.length >= 4 && sample[0] === 0x7f && sample[1] === 0x45 && sample[2] === 0x4c && sample[3] === 0x46
    const strings = printableStrings(sample)
    const maxStrings = Math.max(10, Math.min(args.maxStrings ?? 60, 200))
    const interestingStrings = strings.filter((s) => INTERESTING_RE.test(s) || FLAG_RE.test(s)).slice(0, maxStrings)

    let fileOut = await safeExec("file", [target], cwd)
    let checksecOut = await safeExec("checksec", ["--file", target], cwd)
    let readelfHeader = await safeExec("readelf", ["-h", target], cwd)
    let readelfSyms = await safeExec("readelf", ["-Ws", target], cwd)
    let readelfNotes = await safeExec("readelf", ["-n", target], cwd)
    let nmOut = await safeExec("nm", ["-an", target], cwd)
    let lddOut = await safeExec("ldd", [target], cwd)

    const hostFailures = {
      file: isFailureOutput(fileOut),
      checksec: isFailureOutput(checksecOut),
      readelfHeader: isFailureOutput(readelfHeader),
      readelfSyms: isFailureOutput(readelfSyms),
      readelfNotes: isFailureOutput(readelfNotes),
      nm: isFailureOutput(nmOut),
      ldd: isFailureOutput(lddOut),
    }
    const missingCriticalTools = Object.entries(hostFailures)
      .filter(([key, failed]) => failed && ["file", "checksec", "readelfHeader", "readelfSyms", "nm"].includes(key))
      .map(([key]) => key)

    let probeBackend = "host"
    let dockerFallbackUsed = false
    let degradedReason = ""
    let backendDecisionReason = isElf && process.platform === "win32"
      ? "windows_elf_prefer_linux_substrate_use_host_only_if_tooling_is_already_present"
      : isElf
        ? "native_elf_host_probe"
        : "generic_host_probe"
    let preferredBackendForFutureSteps = process.platform === "win32" && isElf ? "docker_or_wsl_linux_substrate" : "host"
    const shouldTryDockerFallback = isElf && missingCriticalTools.length > 0 && process.platform === "win32"
    if (shouldTryDockerFallback) {
      const dockerVersion = await safeExec("docker", ["version", "--format", "{{.Server.Version}}"], context.directory)
      if (!isFailureOutput(dockerVersion)) {
        probeBackend = "docker_fallback"
        dockerFallbackUsed = true
        backendDecisionReason = `windows_elf_critical_host_tools_missing_${missingCriticalTools.join("_")}_using_docker_fallback`
        preferredBackendForFutureSteps = "docker"
        fileOut = await safeExecDocker(context.directory, target, `file ${shellQuote("__TARGET__")}`)
        checksecOut = await safeExecDocker(context.directory, target, `checksec --file=${shellQuote("__TARGET__")}`)
        readelfHeader = await safeExecDocker(context.directory, target, `readelf -h ${shellQuote("__TARGET__")}`)
        readelfSyms = await safeExecDocker(context.directory, target, `readelf -Ws ${shellQuote("__TARGET__")}`)
        readelfNotes = await safeExecDocker(context.directory, target, `readelf -n ${shellQuote("__TARGET__")}`)
        nmOut = await safeExecDocker(context.directory, target, `nm -an ${shellQuote("__TARGET__")}`)
        lddOut = await safeExecDocker(context.directory, target, `ldd ${shellQuote("__TARGET__")}`)
      } else {
        probeBackend = "degraded"
        degradedReason = `ELF host tools missing on Windows (${missingCriticalTools.join(", ")}) and docker fallback unavailable: ${dockerVersion}`
        backendDecisionReason = `windows_elf_critical_host_tools_missing_${missingCriticalTools.join("_")}_docker_unavailable`
        preferredBackendForFutureSteps = "wsl_or_install_host_wrappers"
      }
    } else if (isElf && missingCriticalTools.length > 0) {
      probeBackend = "degraded"
      degradedReason = `critical probe tools missing: ${missingCriticalTools.join(", ")}`
      backendDecisionReason = `elf_host_probe_degraded_missing_${missingCriticalTools.join("_")}`
      preferredBackendForFutureSteps = process.platform === "win32" ? "docker_or_wsl_linux_substrate" : "install_missing_host_tools"
    }

    const symbolHits = [
      ...grepLines(readelfSyms, INTERESTING_RE, 50),
      ...grepLines(nmOut, INTERESTING_RE, 50),
    ].slice(0, 80)
    const suspiciousImports = grepLines(readelfSyms, DANGEROUS_IMPORT_RE, 80)

    const flagHits = Array.from(new Set(interestingStrings.flatMap((x) => x.match(FLAG_RE) ?? []))).slice(0, 20)
    const trustedTextFlagHits = flagHits.filter((x) => /[A-Za-z]{2,}/.test(x) && x.length <= 120)
    const recommendations: string[] = []
    const combinedRaw = `${fileOut}\n${checksecOut}\n${readelfHeader}\n${readelfNotes}\n${readelfSyms}\n${nmOut}\n${lddOut}\n${symbolHits.join("\n")}\n${interestingStrings.join("\n")}`
    const combined = combinedRaw.toLowerCase()
    const hasVmDispatcher = /opcode|handler|dispatch|jump table|\btable\b|op_load|op_store|op_bounds|run_vm|bytecode/.test(combined)
    const mitigations = parseMitigations(fileOut, checksecOut, readelfHeader, lddOut, combinedRaw)
    const packer = packerSignals(sample, strings, fileOut, readelfHeader, readelfNotes)
    const seeds = routeSeeds(mitigations, combined, symbolHits, interestingStrings)
    const runtime = detectLanguageRuntime(fileOut, strings)
    const goSections = isElf ? parseElfSections(whole) : []
    const gopclntab = goSections.find((s) => s.name === ".gopclntab")
    const goPcln = gopclntab && gopclntab.offset + gopclntab.size <= whole.length
      ? parseGoPclntab(whole.subarray(gopclntab.offset, gopclntab.offset + gopclntab.size), gopclntab.addr)
      : { header_ok: false, ptr_size: 0, nfunc: 0, text_start: 0, funcname_offset: 0, pcln_offset: 0, functions: [] as GoPclnFunction[] }
    const goFunctionHits = runtime.runtime === "go"
      ? Array.from(new Set([
          ...runtime.goFunctionNameHits,
          ...collectGoNameCandidates(whole, 400),
          ...goPcln.functions.map((f) => f.name),
        ])).slice(0, 80)
      : []
    const goClassified = classifyGoFunctions(goFunctionHits)
    const gopclntabOffsets = runtime.runtime === "go"
      ? [...findGopclntabOffsets(sample), ...(gopclntab ? [`0x${gopclntab.offset.toString(16)}`] : [])]
      : []
    const goPivots = buildGoPivotHints(goPcln.functions)
    const goChains = buildGoHelperChains(goPcln.functions, [])
    const goPlan = buildGoExecutionPlan(goPcln.functions, goChains.bestFirstTargets)
    if (/not stripped/.test(combined) && /win|flag/.test(combined) && !hasVmDispatcher) recommendations.push("try direct symbol path first: inspect/call win/flag function before gadget hunting")
    if (/no canary|canary.*disabled/.test(combined)) recommendations.push("stack overflow route likely cheaper: find offset and control RIP/EIP")
    if (/nx.*enabled|nx enabled/.test(combined)) recommendations.push("NX enabled: prefer ret2win/ret2libc/ROP over shellcode")
    if (/pie.*disabled|no pie/.test(combined)) recommendations.push("PIE disabled: fixed code addresses simplify ret2win/ROP")
    if (/partial relro|no relro/.test(combined)) recommendations.push("GOT overwrite may be viable if write primitive exists")
    if (/seccomp/.test(combined)) recommendations.push("seccomp seen: inspect allowed syscalls before shell payload")
    if (/\/bin\/sh|system/.test(combined) && !hasVmDispatcher) recommendations.push("system('/bin/sh') or related string exists: prioritize ret2system chain")
    if (hasVmDispatcher) recommendations.unshift("custom VM/dispatcher signals present: run ctf-pwn-vm-bytecode-helper and let handler/state-slot reduction own the opening route before ret2libc/ret2system heuristics")
    if (packer.verdict === "upx") recommendations.unshift("UPX packer signals detected: verify with upx -t or unpack before deep static reversing; if runtime decrypts again, dump post-unpack code instead of reversing the stub")
    else if (packer.verdict === "generic") recommendations.unshift("packer/self-modifying clues detected: prefer controlled runtime dump or checker slicing on unpacked code before deep stub analysis")
    if (process.platform === "win32" && isElf && probeBackend !== "host") recommendations.unshift("Windows + ELF: keep future runtime-sensitive steps on a Linux substrate; do not downgrade back to host ENOENT-style evidence")
    if (runtime.runtime === "go") recommendations.push("Go binary signals detected: pivot from runtime noise to main.main/custom main.* names, then use string/xref guided checker slicing")
    if (runtime.runtime === "go" && goPcln.functions.length) recommendations.push("function_address_map available: pivot directly to mapped main.main/init/decode/check addresses in ReVa or ida-pro")
    if (!recommendations.length) recommendations.push("start with crash primitive, then leak/control primitive; avoid full reversing unless strings/symbols point there")

    return [
      `target: ${target}`,
      `size: ${stat.size}`,
      `probe_backend: ${probeBackend}`,
      `backend_decision_reason: ${backendDecisionReason}`,
      `preferred_backend_for_future_steps: ${preferredBackendForFutureSteps}`,
      `host_platform: ${process.platform}`,
      `is_elf: ${isElf ? "yes" : "no"}`,
      `language_runtime: ${runtime.runtime}`,
      `host_tool_gap: ${missingCriticalTools.length ? "yes" : "no"}`,
      `missing_host_tools: ${missingCriticalTools.length ? missingCriticalTools.join(", ") : "none"}`,
      `docker_fallback_used: ${dockerFallbackUsed ? "yes" : "no"}`,
      `docker_image: ${dockerFallbackUsed ? DOCKER_PROBE_IMAGE : ""}`,
      `degraded_reason: ${degradedReason || "none"}`,
      `packer_suspected: ${packer.verdict}`,
      `packer_confidence: ${packer.confidence}`,
      `section_header_gap: ${packer.sectionHeaderGap}`,
      `verdict: ${trustedTextFlagHits.length ? "direct_flag_candidate" : "binary"}`,
      `confidence: ${trustedTextFlagHits.length ? "medium" : "medium"}`,
      `next_tool: none`,
      `next_target: ${base}`,
      `spawn_subagent: ${flagHits.length ? "no" : "maybe"}`,
      `direct_solve: no`,
      `sha256: ${stat.size <= 64 * 1024 * 1024 ? await sha256File(target) : "skipped_large_file"}`,
      "mitigation_matrix:",
      `- arch: ${mitigations.arch}`,
      `- bits: ${mitigations.bits}`,
      `- nx: ${yn(mitigations.nx)}`,
      `- pie: ${yn(mitigations.pie)}`,
      `- canary: ${yn(mitigations.canary)}`,
      `- relro: ${mitigations.relro}`,
      `- stripped: ${yn(mitigations.stripped)}`,
      `- static: ${yn(mitigations.staticLinked)}`,
      `- seccomp: ${mitigations.seccomp}`,
      `- cet_ibt: ${mitigations.cetIbt}`,
      `- interpreter: ${mitigations.interpreter}`,
      `- libc: ${mitigations.glibc}`,
      "packer_signals:",
      ...(packer.signals.length ? packer.signals.map((x) => `- ${x}`) : ["- none"]),
      "go_signals:",
      ...(runtime.goSignals.length ? runtime.goSignals.map((x) => `- ${x}`) : ["- none"]),
      "gopclntab_offsets:",
      ...(gopclntabOffsets.length ? gopclntabOffsets.map((x) => `- ${x}`) : ["- none"]),
      `pclntab_header_ok: ${goPcln.header_ok}`,
      "go_function_address_map:",
      ...(goPcln.functions.length ? goPcln.functions.slice(0, 80).map((f) => `- ${f.name}: ${f.entry}`) : ["- none"]),
      "go_function_name_hits:",
      ...(goFunctionHits.length ? goFunctionHits.map((x) => `- ${x}`) : ["- none"]),
      "go_user_code_candidates:",
      ...(goClassified.userCode.length ? goClassified.userCode.slice(0, 40).map((x) => `- ${x}`) : ["- none"]),
      "go_priority_function_addresses:",
      ...(goPivots.priorityFunctions.length ? goPivots.priorityFunctions.map((f) => `- ${f.name}: ${f.entry}`) : ["- none"]),
      "go_analysis_pivots:",
      ...(goPivots.pivotLines.length ? goPivots.pivotLines.map((x) => `- ${x}`) : ["- none"]),
      "go_helper_chains:",
      ...(goChains.helperChains.length ? goChains.helperChains.map((c) => `- ${c.chain.join(" -> ")} (${c.reason})`) : ["- none"]),
      `go_shortest_logic_chain: ${goChains.shortestLogicChain ? goChains.shortestLogicChain.chain.join(" -> ") : "none"}`,
      "go_best_first_targets:",
      ...(goChains.bestFirstTargets.length ? goChains.bestFirstTargets.map((x) => `- ${x}`) : ["- none"]),
      `go_execution_plan: ${goPlan.summary}`,
      "go_execution_plan_steps:",
      ...(goPlan.steps.length ? goPlan.steps.map((s) => `- ${s.tool} ${s.target} (${s.note})`) : ["- none"]),
      "strategy_seeds:",
      ...seeds.map((x) => `- ${x}`),
      "file:",
      fileOut,
      "checksec:",
      checksecOut.split(/\r?\n/).slice(0, 40).join("\n"),
      "readelf_header:",
      readelfHeader.split(/\r?\n/).filter((line) => /Class:|Data:|Machine:|Type:|Entry point|Flags:/.test(line)).join("\n") || readelfHeader.split(/\r?\n/).slice(0, 20).join("\n"),
      "ldd:",
      lddOut.split(/\r?\n/).slice(0, 30).join("\n"),
      "suspicious_imports:",
      ...(suspiciousImports.length ? suspiciousImports.slice(0, 60).map((x) => `- ${x}`) : ["- none"]),
      "interesting_symbols:",
      ...(symbolHits.length ? symbolHits.map((x) => `- ${x}`) : ["- none"]),
      "interesting_strings:",
      ...(interestingStrings.length ? interestingStrings.map((x) => `- ${x}`) : ["- none"]),
      "flag_like_string_hits:",
      ...(trustedTextFlagHits.length ? trustedTextFlagHits.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...recommendations.slice(0, 6).map((x) => `- ${x}`),
      `relative_hint: use ./${base} for local execution from ${cwd}`,
    ].join("\n")
  },
})
