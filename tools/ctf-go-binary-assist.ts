import { tool } from "@opencode-ai/plugin"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"
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
  type GoPclnFunction,
} from "./lib/go-elf-analysis.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`target must stay inside the current workspace: ${input}`)
  return target
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  const matches: string[] = []
  const re = /[ -~]{4,}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push(m[0])
    if (matches.length >= 4000) break
  }
  return matches
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

async function readWholeFile(target: string) {
  const fh = await open(target, "r")
  try {
    const st = await fh.stat()
    const out = Buffer.allocUnsafe(st.size)
    const { bytesRead } = await fh.read(out, 0, st.size, 0)
    return out.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

async function tryObjdump(target: string, cwd: string) {
  const result = await safeExec("objdump", ["-d", "-M", "intel", target], {
    cwd,
    timeoutMs: 20000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (!result.ok) return ""
  const combined = result.output
  return combined === "<no output>" ? "" : combined
}

export default tool({
  description:
    "CTF Go binary assistant: detect Go ELF clues, surface gopclntab-style function names, separate runtime noise from user code, and recommend the shortest next reversing step.",
  args: {
    target: tool.schema.string().describe("Binary file path to inspect"),
    maxStrings: tool.schema.number().optional().describe("Maximum Go-related strings to return. Default 80."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const sample = await readHeadSample(target, Math.min(st.size, 16 * 1024 * 1024))
    const whole = st.size <= 64 * 1024 * 1024 ? await readWholeFile(target) : sample
    const sections = parseElfSections(whole)
    const gopclntab = sections.find((s) => s.name === ".gopclntab")
    const pcln =
      gopclntab && gopclntab.offset + gopclntab.size <= whole.length
        ? parseGoPclntab(whole.subarray(gopclntab.offset, gopclntab.offset + gopclntab.size), gopclntab.addr)
        : {
            header_ok: false,
            ptr_size: 0,
            nfunc: 0,
            text_start: 0,
            funcname_offset: 0,
            pcln_offset: 0,
            functions: [] as GoPclnFunction[],
          }
    const strings = printableStrings(sample)
    const maxStrings = Math.max(10, Math.min(args.maxStrings ?? 80, 200))
    const gopclntabOffsets = [
      ...findGopclntabOffsets(sample),
      ...(gopclntab ? [`0x${gopclntab.offset.toString(16)}`] : []),
    ]
    const goSignals = [
      /go build id[:=]/i.test(strings.join("\n")) ? "go.buildid" : "",
      strings.some((s) => s.includes(".gopclntab")) ? ".gopclntab" : "",
      strings.some((s) => s.includes("runtime.main")) ? "runtime.main" : "",
      strings.some((s) => s.includes("main.main")) ? "main.main" : "",
      strings.some((s) => /\/usr\/local\/go\/src\//.test(s)) ? "goroot-source-paths" : "",
      strings.some((s) => /go1\.[0-9]+/.test(s)) ? "go-version-hint" : "",
    ].filter(Boolean)
    const functionNames = Array.from(
      new Set([
        ...strings.filter(
          (s) =>
            /\b(?:main|runtime)\.[A-Za-z0-9_]+\b/.test(s) ||
            /\b(?:fmt|bytes|strings|os|io|encoding\/base64|crypto\/[A-Za-z0-9_\/]+)\.[A-Za-z0-9_]+\b/.test(s),
        ),
        ...collectGoNameCandidates(whole, 800),
        ...pcln.functions.map((f) => f.name),
      ]),
    ).slice(0, Math.max(maxStrings, 120))
    const classified = classifyGoFunctions(functionNames)
    const userCodeCandidates = classified.userCode.slice(0, maxStrings)
    const runtimeNoise = classified.runtimeNoise.slice(0, 30)
    const goVersionHints = Array.from(
      new Set(strings.flatMap((s) => s.match(/go1\.[0-9]+(?:\.[0-9]+)?/g) ?? [])),
    ).slice(0, 10)
    const detected = goSignals.length >= 2 || functionNames.some((s) => s === "main.main")
    const pivots = buildGoPivotHints(pcln.functions)
    const disasm = detected ? await tryObjdump(target, path.dirname(target)) : ""
    const goCalls = buildGoCallHints(disasm, pcln.functions)
    const goChains = buildGoHelperChains(pcln.functions, goCalls.hints)
    const plan = buildGoExecutionPlan(pcln.functions, goChains.bestFirstTargets)
    const payload = {
      target,
      size: st.size,
      detected_go: detected,
      confidence: detected ? "high" : "low",
      go_signals: goSignals,
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
      pclntab_nfunc: pcln.nfunc,
      pclntab_text_start: pcln.text_start ? `0x${pcln.text_start.toString(16)}` : "unknown",
      function_address_map: pcln.functions.slice(0, 120),
      go_version_hints: goVersionHints,
      function_name_hits: functionNames,
      user_code_candidates: userCodeCandidates,
      runtime_noise_candidates: runtimeNoise,
      init_chain_candidates: classified.initChain,
      decoder_like_candidates: classified.decoderLike,
      priority_function_addresses: pivots.priorityFunctions,
      analysis_pivots: pivots.pivotLines,
      call_hints: goCalls.hints,
      call_summary: goCalls.summary,
      helper_chains: goChains.helperChains,
      shortest_logic_chain: goChains.shortestLogicChain,
      best_first_targets: goChains.bestFirstTargets,
      execution_plan: plan,
      recommended_next: detected
        ? [
            "prefer main.main and custom main.* names before raw runtime startup",
            "if .gopclntab-like offsets exist, treat nearby name hits as stronger than generic runtime.main noise",
            "if function_address_map contains main.main or decode/check helpers, pivot directly to those addresses in ReVa/IDA instead of generic entry traversal",
            "if call_summary shows main.main -> helper relationships, follow those helper pivots before broad runtime browsing",
            "if shortest_logic_chain exists, use that chain as the default first-pass decompile order",
            "prioritize decoder/check/verify/base64-like main.* helpers before allocator/panic/runtime paths",
            "use string/xref guided slicing from success/failure text into user-code candidates",
            "if ReVa cannot map main.main directly, use these function-name hits as a side-channel clue and pivot through string-bearing compare/decoder helpers",
          ]
        : ["no strong Go signal; fall back to generic native checker slicing"],
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      `target: ${target}`,
      `size: ${st.size}`,
      `detected_go: ${detected}`,
      `confidence: ${payload.confidence}`,
      "go_signals:",
      ...(goSignals.length ? goSignals.map((x) => `- ${x}`) : ["- none"]),
      "gopclntab_offsets:",
      ...(gopclntabOffsets.length ? gopclntabOffsets.map((x) => `- ${x}`) : ["- none"]),
      `gopclntab_section: ${gopclntab ? `${payload.gopclntab_section?.offset} size=${payload.gopclntab_section?.size} addr=${payload.gopclntab_section?.addr}` : "none"}`,
      `pclntab_header_ok: ${pcln.header_ok}`,
      `pclntab_ptr_size: ${pcln.ptr_size}`,
      `pclntab_nfunc: ${pcln.nfunc}`,
      `pclntab_text_start: ${payload.pclntab_text_start}`,
      "go_version_hints:",
      ...(goVersionHints.length ? goVersionHints.map((x) => `- ${x}`) : ["- none"]),
      "function_address_map:",
      ...(pcln.functions.length
        ? pcln.functions
            .slice(0, 120)
            .map(
              (f) =>
                `- ${f.name}: ${f.entry} (entry_off=${f.entry_offset}, func_off=${f.func_offset}, name_off=${f.name_offset})`,
            )
        : ["- none"]),
      "user_code_candidates:",
      ...(userCodeCandidates.length ? userCodeCandidates.map((x) => `- ${x}`) : ["- none"]),
      "runtime_noise_candidates:",
      ...(runtimeNoise.length ? runtimeNoise.map((x) => `- ${x}`) : ["- none"]),
      "init_chain_candidates:",
      ...(classified.initChain.length ? classified.initChain.slice(0, 40).map((x) => `- ${x}`) : ["- none"]),
      "decoder_like_candidates:",
      ...(classified.decoderLike.length ? classified.decoderLike.slice(0, 60).map((x) => `- ${x}`) : ["- none"]),
      "priority_function_addresses:",
      ...(pivots.priorityFunctions.length
        ? pivots.priorityFunctions.map((f) => `- ${f.name}: ${f.entry}`)
        : ["- none"]),
      "analysis_pivots:",
      ...(pivots.pivotLines.length ? pivots.pivotLines.map((x) => `- ${x}`) : ["- none"]),
      "call_summary:",
      ...(goCalls.summary.length ? goCalls.summary.map((x) => `- ${x}`) : ["- none"]),
      "helper_chains:",
      ...(goChains.helperChains.length
        ? goChains.helperChains.map((c) => `- ${c.chain.join(" -> ")} (${c.reason})`)
        : ["- none"]),
      `shortest_logic_chain: ${goChains.shortestLogicChain ? goChains.shortestLogicChain.chain.join(" -> ") : "none"}`,
      "best_first_targets:",
      ...(goChains.bestFirstTargets.length ? goChains.bestFirstTargets.map((x) => `- ${x}`) : ["- none"]),
      `execution_plan: ${plan.summary}`,
      "execution_plan_steps:",
      ...(plan.steps.length ? plan.steps.map((s) => `- ${s.tool} ${s.target} (${s.note})`) : ["- none"]),
      "function_name_hits:",
      ...(functionNames.length ? functionNames.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...payload.recommended_next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
