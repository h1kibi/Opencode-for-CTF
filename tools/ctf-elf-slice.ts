import { tool } from "@opencode-ai/plugin"
import { access, lstat, open } from "node:fs/promises"
import path from "node:path"
import { safeExec, safeExecDocker, shellQuote } from "./lib/exec-utils.ts"
import { pwnImage } from "./lib/docker-config.ts"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"
import {
  buildGoCallHints,
  buildGoExecutionPlan,
  buildGoHelperChains,
  buildGoPivotHints,
  classifyGoFunctions,
  collectGoNameCandidates,
  detectGoFromStrings,
  findGopclntabOffsets,
  parseElfSections,
  parseGoPclntab,
} from "./lib/go-elf-analysis.ts"

const DEFAULT_INTERESTING =
  /(win|flag|backdoor|shell|system|execve|puts|printf|fprintf|sprintf|gets|fgets|read|write|open|openat|sendfile|malloc|calloc|realloc|free|mprotect|mmap|seccomp|alarm|setvbuf|stdin|stdout|stderr|socket|connect|accept|recv|send|dup2|strcpy|strncpy|strcat|memcpy|memcmp|strcmp|strncmp|puts@plt|__libc_start_main|__stack_chk_fail|tcache|unsorted|fastbin|hook|one_gadget|orw)/i

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

function compact(s: string, max = 1800) {
  if (s.length <= max) return s
  return `${s.slice(0, Math.floor(max * 0.65))}\n...[truncated ${s.length - max} chars]...\n${s.slice(s.length - Math.floor(max * 0.35))}`
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  const matches: Array<{ text: string; offset: number }> = []
  const re = /[ -~]{4,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ text: m[0], offset: m.index })
    if (matches.length >= 500) break
  }
  return matches
}

async function toolAwareExec(
  contextDir: string,
  workspaceTarget: string,
  cmd: string,
  args: string[],
  timeout = 12000,
) {
  const local = await safeExec(cmd, args, path.dirname(workspaceTarget), timeout)
  if (
    !/enoent|not recognized as an internal or external command|is not recognized/i.test(local.output) ||
    process.platform !== "win32"
  ) {
    return { output: local.output, source: "host" as const }
  }
  const shellCmd = [
    JSON.stringify(cmd),
    ...args.map((a) => (a === workspaceTarget ? JSON.stringify("__TARGET__") : JSON.stringify(a))),
  ].join(" ")
  const fallback = await safeExecDocker(
    contextDir,
    workspaceTarget,
    pwnImage("general-ubuntu22.04"),
    shellCmd,
    Math.max(timeout, 20000),
  )
  return {
    output: fallback.output,
    source:
      /error response from daemon|unable to find image|docker/i.test(fallback.output) &&
      /enoent|not recognized as an internal or external command/i.test(local.output)
        ? "host_missing_tool"
        : ("pwnlab" as const),
  }
}

function sliceAroundLines(lines: string[], hitIdx: number, radius: number) {
  const start = Math.max(0, hitIdx - radius)
  const end = Math.min(lines.length, hitIdx + radius + 1)
  return lines.slice(start, end)
}

function parseHeader(readelfHeader: string) {
  const arch = readelfHeader.match(/Machine:\s*(.+)/i)?.[1]?.trim() || "unknown"
  const cls = readelfHeader.match(/Class:\s*(.+)/i)?.[1]?.trim() || "unknown"
  const endian = readelfHeader.match(/Data:\s*(.+)/i)?.[1]?.trim() || "unknown"
  const type = readelfHeader.match(/Type:\s*(.+)/i)?.[1]?.trim() || "unknown"
  const entry = readelfHeader.match(/Entry point address:\s*(.+)/i)?.[1]?.trim() || "unknown"
  return { arch, cls, endian, type, entry }
}

function grepSections(readelfSections: string[]) {
  return readelfSections
    .filter((line) =>
      /\.(text|plt|got|got\.plt|data|bss|rodata|init_array|fini_array|dynamic|symtab|strtab)/.test(line),
    )
    .slice(0, 32)
}

function parseNamedSymbols(text: string, names: string[]) {
  const lines = text.split(/\r?\n/)
  const out: Record<string, string> = {}
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\b${escaped}\\b`)
    const line = lines.find((x) => re.test(x))
    if (line) out[name] = line.trim()
  }
  return out
}

function collectFunctionLabels(lines: string[], preferred: string[], max = 12) {
  const out: string[] = []
  const seen = new Set<string>()
  const labelRe = /^([0-9a-f]+)\s+<([^>]+)>:$/i
  for (const line of lines) {
    const m = line.match(labelRe)
    if (!m) continue
    const label = `${m[1]} <${m[2]}>`
    if (preferred.some((name) => m[2] === name || m[2].endsWith(`.${name}`) || m[2].includes(name))) {
      if (!seen.has(label)) {
        seen.add(label)
        out.push(label)
      }
    }
  }
  if (out.length < max) {
    for (const line of lines) {
      const m = line.match(labelRe)
      if (!m) continue
      const label = `${m[1]} <${m[2]}>`
      if (seen.has(label)) continue
      if (
        /main|_start|start|init|fini|vuln|win|flag|backdoor|menu|handle|check|auth|login|loop|read|print/i.test(m[2])
      ) {
        seen.add(label)
        out.push(label)
        if (out.length >= max) break
      }
    }
  }
  return out
}

function parseStackLayoutHints(lines: string[]) {
  const frameMap = new Map<string, { tags: Set<string>; examples: string[] }>()
  let currentFunction = ""
  let lastAddressTakenOffset = ""
  let lastAddressTakenLine = -100

  const ensure = (offset: string) => {
    if (!frameMap.has(offset)) frameMap.set(offset, { tags: new Set<string>(), examples: [] })
    return frameMap.get(offset)!
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fn = line.match(/^([0-9a-f]+)\s+<([^>]+)>:$/i)
    if (fn) {
      currentFunction = fn[2]
      continue
    }
    const refs = Array.from(line.matchAll(/\[(?:r|e)bp([+-])0x([0-9a-f]+)(?:[^\]]*)\]/gi))
    if (!refs.length) continue
    for (const ref of refs) {
      const offset = `${ref[1]}0x${ref[2].toLowerCase()}`
      const slot = ensure(offset)
      if (slot.examples.length < 3) slot.examples.push(`${currentFunction || "?"}: ${line.trim()}`)
      if (/lea\s+\w+,\s*\[(?:r|e)bp-0x/i.test(line)) {
        slot.tags.add("address-taken")
        lastAddressTakenOffset = offset
        lastAddressTakenLine = i
      }
      if (/mov\s+byte ptr\s+\[(?:r|e)bp-0x[0-9a-f]+\],0x0/i.test(line)) slot.tags.add("null-terminator-write")
      if (/(cmp|add|sub|inc|dec)\s+(?:dword|qword|byte)?\s*ptr\s+\[(?:r|e)bp-0x/i.test(line))
        slot.tags.add("counter-or-state")
      if (/mov\s+byte ptr\s+\[(?:r|e)bp[^\]]*\+[^\]]*\],/i.test(line)) slot.tags.add("indexed-byte-write")
    }
    if (
      /call\s+.*<(read|recv|gets|fgets)@plt>/i.test(line) &&
      lastAddressTakenOffset &&
      i - lastAddressTakenLine <= 6
    ) {
      ensure(lastAddressTakenOffset).tags.add("input-buffer")
    }
  }

  const summary = Array.from(frameMap.entries())
    .filter(([offset]) => offset.startsWith("-"))
    .sort((a, b) => parseInt(b[0].slice(3), 16) - parseInt(a[0].slice(3), 16))
    .slice(0, 12)
    .map(([offset, info]) => {
      const tags = Array.from(info.tags)
      const role = tags.includes("input-buffer")
        ? "likely input buffer"
        : tags.includes("indexed-byte-write")
          ? "indexed write target"
          : tags.includes("counter-or-state")
            ? "likely loop/state variable"
            : tags.includes("address-taken")
              ? "address-taken local"
              : "stack local"
      return `${offset}: ${role}${tags.length ? `; tags=${tags.join(",")}` : ""}`
    })

  if (summary.length) {
    summary.push("+0x0: saved rbp / frame-pointer boundary")
    summary.push("+0x8: return address boundary")
  }
  return summary
}

function addrToLineTarget(name: string, functions: Array<{ name: string; entry: string }>) {
  const hit = functions.find((f) => f.name === name)
  return hit ? hit.entry.replace(/^0x/i, "") : ""
}

function toTargetHint(name: string, functions: Array<{ name: string; entry: string }>, mode: "reva" | "ida" | "slice") {
  const hit = functions.find((f) => f.name === name)
  if (!hit) return ""
  if (mode === "reva") return `ReVa_get-decompilation functionNameOrAddress=${hit.entry}  # ${name}`
  if (mode === "ida") return `ida-pro_decompile addr=${hit.entry}  # ${name}`
  return `ctf-elf-slice address=${hit.entry.replace(/^0x/i, "")}  # ${name}`
}

export default tool({
  description:
    "CTF ELF slice: extract compact ELF metadata, sections, interesting strings/symbols, and function/keyword-focused objdump slices without scrolling huge outputs.",
  args: {
    target: tool.schema.string().describe("ELF file path to inspect"),
    keyword: tool.schema.string().optional().describe("Regex keyword for focused strings/symbol/disassembly slices."),
    functionName: tool.schema
      .string()
      .optional()
      .describe("Optional function name to center disassembly on, e.g. main or add."),
    address: tool.schema
      .string()
      .optional()
      .describe("Optional hex address substring to center disassembly on, e.g. 4012ab."),
    maxStrings: tool.schema.number().optional().describe("Maximum interesting strings to return. Default 60."),
    disasmRadius: tool.schema.number().optional().describe("Lines around each hit. Default 4."),
    maxSlices: tool.schema.number().optional().describe("Maximum disassembly slices to return. Default 8."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const fh = await open(target, "r")
    const head = Buffer.alloc(Math.min(2 * 1024 * 1024, st.size))
    const { bytesRead } = await fh.read(head, 0, head.length, 0)
    await fh.close()
    const sample = head.subarray(0, bytesRead)
    const whole =
      st.size <= 64 * 1024 * 1024
        ? await (async () => {
            const f = await open(target, "r")
            try {
              const out = Buffer.allocUnsafe(st.size)
              const { bytesRead } = await f.read(out, 0, st.size, 0)
              return out.subarray(0, bytesRead)
            } finally {
              await f.close()
            }
          })()
        : sample
    if (!sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])))
      throw new Error("target is not an ELF file")

    const kw = args.keyword ? new RegExp(args.keyword, "i") : DEFAULT_INTERESTING
    const maxStrings = Math.max(10, Math.min(args.maxStrings ?? 60, 200))
    const maxSlices = Math.max(1, Math.min(args.maxSlices ?? 8, 20))
    const radius = Math.max(1, Math.min(args.disasmRadius ?? 4, 20))

    const strings = printableStrings(sample)
    const interestingStrings = strings.filter((s) => kw.test(s.text)).slice(0, maxStrings)
    const allStrings = printableStrings(whole)
    const goInfo = detectGoFromStrings(allStrings.map((s) => s.text))
    const sectionsParsed = parseElfSections(whole)
    const gopclntab = sectionsParsed.find((s) => s.name === ".gopclntab")
    const pcln =
      gopclntab && gopclntab.offset + gopclntab.size <= whole.length
        ? parseGoPclntab(whole.subarray(gopclntab.offset, gopclntab.offset + gopclntab.size), gopclntab.addr)
        : { header_ok: false, ptr_size: 0, nfunc: 0, text_start: 0, funcname_offset: 0, pcln_offset: 0, functions: [] }
    const goFunctionNameHits = Array.from(
      new Set([
        ...goInfo.functionNameHits,
        ...collectGoNameCandidates(whole, 800),
        ...pcln.functions.map((f) => f.name),
      ]),
    ).slice(0, 120)
    const goClassified = classifyGoFunctions(goFunctionNameHits)
    const gopclntabOffsets = [
      ...findGopclntabOffsets(sample),
      ...(gopclntab ? [`0x${gopclntab.offset.toString(16)}`] : []),
    ]
    const goPivots = buildGoPivotHints(pcln.functions)

    const cwd = path.dirname(target)
    const readelfHeaderRes = await toolAwareExec(context.directory, target, "readelf", ["-h", target], 12000)
    const readelfSectionsRes = await toolAwareExec(context.directory, target, "readelf", ["-S", target], 12000)
    const readelfSymbolsRes = await toolAwareExec(context.directory, target, "readelf", ["-Ws", target], 15000)
    const nmRes = await toolAwareExec(context.directory, target, "nm", ["-an", target], 15000)
    const objdumpHeadersRes = await toolAwareExec(context.directory, target, "objdump", ["-x", target], 15000)
    const objdumpDisasmRes = await toolAwareExec(
      context.directory,
      target,
      "objdump",
      ["-d", "-M", "intel", target],
      20000,
    )
    const readelfHeader = readelfHeaderRes.output
    const readelfSections = readelfSectionsRes.output.split(/\r?\n/)
    const readelfSymbols = readelfSymbolsRes.output
    const nmOut = nmRes.output
    const objdumpHeaders = objdumpHeadersRes.output
    const objdumpDisasm = objdumpDisasmRes.output

    const header = parseHeader(readelfHeader)
    const sectionHits = grepSections(readelfSections)
    const namedSymbols = parseNamedSymbols(`${readelfSymbols}\n${nmOut}`, [
      "main",
      "_start",
      "start",
      "vuln",
      "win",
      "print_flag",
      "menu",
      "handle",
      "check",
      "auth",
      "read_flag",
    ])
    const symbolLines = readelfSymbols
      .split(/\r?\n/)
      .filter((line) => kw.test(line))
      .slice(0, 80)
    const nmHits = nmOut
      .split(/\r?\n/)
      .filter(
        (line) =>
          kw.test(line) || /\b(main|_start|start|vuln|win|print_flag|menu|handle|check|auth|read_flag)\b/i.test(line),
      )
      .slice(0, 80)
    const headerHits = objdumpHeaders
      .split(/\r?\n/)
      .filter((line) => kw.test(line) || /NEEDED|INTERP|RPATH|RUNPATH/i.test(line))
      .slice(0, 80)

    const disasmLines = objdumpDisasm.split(/\r?\n/)
    const candidateFunctions = collectFunctionLabels(disasmLines, Object.keys(namedSymbols))
    const disasmAnalysis = analyzePwnDisasmText(objdumpDisasm)
    const goCalls = buildGoCallHints(objdumpDisasm, pcln.functions)
    const goChains = buildGoHelperChains(pcln.functions, goCalls.hints)
    const goPlan = buildGoExecutionPlan(pcln.functions, goChains.bestFirstTargets)
    const stackLayoutHints = disasmAnalysis.stackLayoutHints
    const disasmSlices: string[] = []
    for (let i = 0; i < disasmLines.length; i++) {
      const line = disasmLines[i]
      const fnHit = args.functionName && new RegExp(`<${args.functionName}>`, "i").test(line)
      const kwHit = kw.test(line)
      const addrHit = args.address && line.includes(args.address.replace(/^0x/i, ""))
      const chainHit = goChains.bestFirstTargets.some(
        (targetName) =>
          line.includes(`<${targetName}>`) ||
          (addrToLineTarget(targetName, pcln.functions) &&
            line.includes(addrToLineTarget(targetName, pcln.functions)!)),
      )
      if (!fnHit && !kwHit && !addrHit && !chainHit) continue
      disasmSlices.push(sliceAroundLines(disasmLines, i, radius).join("\n"))
      if (disasmSlices.length >= maxSlices) break
    }

    const payload = {
      target,
      size: st.size,
      header,
      sections: sectionHits,
      named_symbols: namedSymbols,
      interesting_symbols: symbolLines,
      nm_hits: nmHits,
      candidate_functions: candidateFunctions,
      language_runtime: goInfo.runtime,
      go_signals: goInfo.goSignals,
      gopclntab_offsets: gopclntabOffsets,
      gopclntab_section: gopclntab
        ? {
            offset: `0x${gopclntab.offset.toString(16)}`,
            size: gopclntab.size,
            addr: `0x${gopclntab.addr.toString(16)}`,
          }
        : null,
      pclntab_header_ok: pcln.header_ok,
      pclntab_ptr_size: pcln.ptr_size,
      function_address_map: pcln.functions.slice(0, 120),
      go_function_name_hits: goFunctionNameHits,
      go_user_code_candidates: goClassified.userCode.slice(0, 80),
      go_runtime_noise_candidates: goClassified.runtimeNoise.slice(0, 40),
      go_priority_function_addresses: goPivots.priorityFunctions,
      go_analysis_pivots: goPivots.pivotLines,
      go_call_hints: goCalls.hints,
      go_call_summary: goCalls.summary,
      go_helper_chains: goChains.helperChains,
      go_shortest_logic_chain: goChains.shortestLogicChain,
      go_best_first_targets: goChains.bestFirstTargets,
      go_execution_plan: goPlan,
      preferred_reva_targets: goChains.bestFirstTargets
        .map((name) => toTargetHint(name, pcln.functions, "reva"))
        .filter(Boolean),
      preferred_ida_targets: goChains.bestFirstTargets
        .map((name) => toTargetHint(name, pcln.functions, "ida"))
        .filter(Boolean),
      preferred_slice_targets: goChains.bestFirstTargets
        .map((name) => toTargetHint(name, pcln.functions, "slice"))
        .filter(Boolean),
      stack_layout_hints: stackLayoutHints,
      red_flag_tags: disasmAnalysis.redFlagTags,
      constraint_hints: disasmAnalysis.constraintHints,
      interesting_headers: headerHits,
      interesting_strings: interestingStrings.map((s) => ({ offset: `0x${s.offset.toString(16)}`, text: s.text })),
      tool_sources: {
        readelf_header: readelfHeaderRes.source,
        readelf_sections: readelfSectionsRes.source,
        readelf_symbols: readelfSymbolsRes.source,
        nm: nmRes.source,
        objdump_headers: objdumpHeadersRes.source,
        objdump_disasm: objdumpDisasmRes.source,
      },
      disasm_slices: disasmSlices,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      `target: ${target}`,
      `size: ${st.size}`,
      `arch: ${payload.header.arch}`,
      `class: ${payload.header.cls}`,
      `endian: ${payload.header.endian}`,
      `type: ${payload.header.type}`,
      `entry: ${payload.header.entry}`,
      "sections:",
      ...(sectionHits.length ? sectionHits.map((x) => `- ${x}`) : ["- none"]),
      "interesting_headers:",
      ...(headerHits.length ? headerHits.map((x) => `- ${x}`) : ["- none"]),
      "named_symbols:",
      ...(Object.keys(namedSymbols).length ? Object.entries(namedSymbols).map(([k, v]) => `- ${k}: ${v}`) : ["- none"]),
      "candidate_functions:",
      ...(candidateFunctions.length ? candidateFunctions.map((x) => `- ${x}`) : ["- none"]),
      `language_runtime: ${goInfo.runtime}`,
      "go_signals:",
      ...(goInfo.goSignals.length ? goInfo.goSignals.map((x) => `- ${x}`) : ["- none"]),
      "gopclntab_offsets:",
      ...(gopclntabOffsets.length ? gopclntabOffsets.map((x) => `- ${x}`) : ["- none"]),
      `gopclntab_section: ${gopclntab ? `${payload.gopclntab_section?.offset} size=${payload.gopclntab_section?.size} addr=${payload.gopclntab_section?.addr}` : "none"}`,
      `pclntab_header_ok: ${pcln.header_ok}`,
      `pclntab_ptr_size: ${pcln.ptr_size}`,
      "function_address_map:",
      ...(pcln.functions.length ? pcln.functions.slice(0, 120).map((f) => `- ${f.name}: ${f.entry}`) : ["- none"]),
      "go_function_name_hits:",
      ...(goFunctionNameHits.length ? goFunctionNameHits.map((x) => `- ${x}`) : ["- none"]),
      "go_user_code_candidates:",
      ...(goClassified.userCode.length ? goClassified.userCode.slice(0, 80).map((x) => `- ${x}`) : ["- none"]),
      "go_runtime_noise_candidates:",
      ...(goClassified.runtimeNoise.length ? goClassified.runtimeNoise.slice(0, 40).map((x) => `- ${x}`) : ["- none"]),
      "go_priority_function_addresses:",
      ...(goPivots.priorityFunctions.length
        ? goPivots.priorityFunctions.map((f) => `- ${f.name}: ${f.entry}`)
        : ["- none"]),
      "go_analysis_pivots:",
      ...(goPivots.pivotLines.length ? goPivots.pivotLines.map((x) => `- ${x}`) : ["- none"]),
      "go_call_summary:",
      ...(goCalls.summary.length ? goCalls.summary.map((x) => `- ${x}`) : ["- none"]),
      "go_helper_chains:",
      ...(goChains.helperChains.length
        ? goChains.helperChains.map((c) => `- ${c.chain.join(" -> ")} (${c.reason})`)
        : ["- none"]),
      `go_shortest_logic_chain: ${goChains.shortestLogicChain ? goChains.shortestLogicChain.chain.join(" -> ") : "none"}`,
      "go_best_first_targets:",
      ...(goChains.bestFirstTargets.length ? goChains.bestFirstTargets.map((x) => `- ${x}`) : ["- none"]),
      `go_execution_plan: ${goPlan.summary}`,
      "go_execution_plan_steps:",
      ...(goPlan.steps.length ? goPlan.steps.map((s) => `- ${s.tool} ${s.target} (${s.note})`) : ["- none"]),
      "preferred_reva_targets:",
      ...(
        goChains.bestFirstTargets.map((name) => toTargetHint(name, pcln.functions, "reva")).filter(Boolean) as string[]
      ).map((x) => `- ${x}`),
      "preferred_ida_targets:",
      ...(
        goChains.bestFirstTargets.map((name) => toTargetHint(name, pcln.functions, "ida")).filter(Boolean) as string[]
      ).map((x) => `- ${x}`),
      "preferred_slice_targets:",
      ...(
        goChains.bestFirstTargets.map((name) => toTargetHint(name, pcln.functions, "slice")).filter(Boolean) as string[]
      ).map((x) => `- ${x}`),
      "stack_layout_hints:",
      ...(stackLayoutHints.length ? stackLayoutHints.map((x: string) => `- ${x}`) : ["- none"]),
      "red_flag_tags:",
      ...(disasmAnalysis.redFlagTags.length ? disasmAnalysis.redFlagTags.map((x: string) => `- ${x}`) : ["- none"]),
      "constraint_hints:",
      ...(disasmAnalysis.constraintHints.length
        ? disasmAnalysis.constraintHints.map((x: string) => `- ${x}`)
        : ["- none"]),
      "interesting_symbols:",
      ...(symbolLines.length ? symbolLines.map((x) => `- ${x}`) : ["- none"]),
      "nm_hits:",
      ...(nmHits.length ? nmHits.map((x) => `- ${x}`) : ["- none"]),
      "interesting_strings:",
      ...(interestingStrings.length ? interestingStrings.map((s) => `- ${s.offset}: ${s.text}`) : ["- none"]),
      "tool_sources:",
      ...Object.entries(payload.tool_sources).map(([k, v]) => `- ${k}: ${v}`),
      "disasm_slices:",
      ...(disasmSlices.length ? disasmSlices.map((x, i) => `--- slice ${i + 1} ---\n${compact(x)}`) : ["- none"]),
    ].join("\n")
  },
})
