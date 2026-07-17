import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { pwnImage } from "./lib/docker-config.ts"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

async function safeExecInPwnlab(
  contextDir: string,
  workspaceTarget: string,
  cmd: string,
  args: string[],
  timeout = 20000,
) {
  const rel = path.relative(contextDir, workspaceTarget).replace(/\\/g, "/")
  const inContainer = path.posix.join("/work", rel)
  const result = await safeExec(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${contextDir.replace(/\\/g, "/")}:/work`,
      "-w",
      "/work",
      pwnImage("general-ubuntu22.04"),
      "bash",
      "-lc",
      [cmd, ...args.map((x) => (x === workspaceTarget ? inContainer : x))].map((x) => JSON.stringify(x)).join(" "),
    ],
    contextDir,
    timeout,
  )
  return result.output
}

async function objdumpWithFallback(contextDir: string, target: string, timeout = 12000) {
  const local = await safeExec("objdump", ["-d", "-M", "intel", target], path.dirname(target), timeout)
  if (
    !/enoent|not recognized as an internal or external command|is not recognized/i.test(local.output) ||
    process.platform !== "win32"
  ) {
    return local.output
  }
  return await safeExecInPwnlab(contextDir, target, "objdump", ["-d", "-M", "intel", target], Math.max(timeout, 20000))
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function splitLines(text: string) {
  return String(text || "").split(/\r?\n/)
}

function functionRanges(lines: string[]) {
  const out: Array<{ name: string; start: number; end: number; body: string[] }> = []
  const fnRe = /^([0-9a-f]+)\s+<([^>]+)>:$/i
  let current: { name: string; start: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fnRe)
    if (!m) continue
    if (current) out.push({ name: current.name, start: current.start, end: i - 1, body: lines.slice(current.start, i) })
    current = { name: m[2], start: i }
  }
  if (current)
    out.push({ name: current.name, start: current.start, end: lines.length - 1, body: lines.slice(current.start) })
  return out
}

function classifyHandler(body: string[]) {
  const text = body.join("\n").toLowerCase()
  const tags: string[] = []
  if (
    /mov\s+\w+,\s*\[[^\]]+\]|movzx\s+\w+,\s*byte ptr\s*\[[^\]]+\]|cmp\s+\w+,\s*\[[^\]]+\]|add\s+\w+,\s*\[[^\]]+\]/.test(
      text,
    )
  )
    tags.push("read-like")
  if (/mov\s+\[[^\]]+\],\s*\w+|mov\s+byte ptr\s*\[[^\]]+\],\s*\w+|stos|memcpy|strcpy/.test(text))
    tags.push("write-like")
  if (/add|sub|xor|imul|mul|shl|shr|sar|and|or/.test(text)) tags.push("arithmetic-like")
  if (/cmp|test|ja|jb|jg|jl|jbe|jae|jle|jge|cmov/.test(text)) tags.push("compare-or-bounds-like")
  if (/jmp\s+\*|call\s+\*|jmp\s+qword ptr|jmp\s+dword ptr/.test(text)) tags.push("indirect-dispatch-like")
  if (/0xf|0xff|0x10|0x20|0x100|0x1000|0xfff/.test(text) && /cmp|and|test/.test(text))
    tags.push("mask-or-bounds-width-hint")
  if (/\[[^\]]+\+\w+\*1\]|\[[^\]]+\+\w+\*4\]|\[[^\]]+\+\w+\*8\]/.test(text)) tags.push("indexed-state-access")
  return uniq(tags)
}

function guessOpcodeWidth(text: string) {
  const lower = text.toLowerCase()
  const hints: string[] = []
  if (/and\s+\w+,\s*0xf\b|shr\s+\w+,\s*0x4\b|shr\s+\w+,\s*4\b/.test(lower))
    hints.push("high/low nibble split likely (4-bit opcode field)")
  if (/and\s+\w+,\s*0xff\b|movzx\s+\w+,\s*byte ptr/.test(lower))
    hints.push("byte-wide opcode or operand field likely (8-bit)")
  if (/and\s+\w+,\s*0xfff\b|and\s+\w+,\s*0x0fff\b/.test(lower)) hints.push("12-bit offset / masked window hint")
  if (/shl\s+\w+,\s*0x4\b|shl\s+\w+,\s*4\b/.test(lower))
    hints.push("packed nybble fields may be reassembled via shifts")
  return uniq(hints)
}

function stateOffsetHints(body: string[]) {
  const hints: string[] = []
  for (const line of body) {
    for (const m of line.matchAll(/\[(?:r|e)(?:bx|bp|sp|si|di|12|13|14|15)(?:[+-]0x[0-9a-f]+)?\]/gi)) {
      hints.push(m[0])
    }
  }
  return uniq(hints).slice(0, 10)
}

function detectStateSlotClusters(handlers: Array<{ name: string; state_offsets: string[] }>) {
  const slotToHandlers = new Map<string, string[]>()
  for (const handler of handlers) {
    for (const slot of handler.state_offsets) {
      if (!slotToHandlers.has(slot)) slotToHandlers.set(slot, [])
      slotToHandlers.get(slot)!.push(handler.name)
    }
  }
  return Array.from(slotToHandlers.entries())
    .filter(([, names]) => names.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([slot, names]) => `${slot}: shared_by=${uniq(names).join(",")}`)
}

function riskScore(tags: string[]) {
  let score = 0
  if (tags.includes("write-like")) score += 5
  if (tags.includes("read-like")) score += 3
  if (tags.includes("compare-or-bounds-like")) score += 2
  if (tags.includes("mask-or-bounds-width-hint")) score += 2
  if (tags.includes("indirect-dispatch-like")) score += 2
  return score
}

function oobRiskScore(tags: string[], stateOffsets: string[]) {
  let score = riskScore(tags)
  if (tags.includes("write-like") && tags.includes("mask-or-bounds-width-hint")) score += 4
  if (tags.includes("write-like") && tags.includes("compare-or-bounds-like")) score += 3
  if (tags.includes("read-like") && tags.includes("mask-or-bounds-width-hint")) score += 2
  if (stateOffsets.some((x) => /\+0x[0-9a-f]{2,}/i.test(x))) score += 1
  return score
}

function detectDispatcherSignals(text: string) {
  const lower = text.toLowerCase()
  const out: string[] = []
  if (/jmp\s+q?word ptr \[[^\]]+\]/.test(lower) || /call\s+q?word ptr \[[^\]]+\]/.test(lower))
    out.push("indirect jump/call dispatch")
  if (/switch|jump table|dispatch|opcode|handler/.test(lower)) out.push("textual dispatch/opcode clue")
  if (/cmp\s+[^\n]*0x[f0-9]+[^\n]*\n[^\n]*ja|jb|jg|jl/.test(lower)) out.push("opcode bounds-check before branch")
  if (
    /lea\s+\w+,\s*\[[^\]]+\]\s*\n[^\n]*jmp\s+q?word ptr \[\w+\+\w+\*8\]/.test(lower) ||
    /jmp\s+q?word ptr \[[^\]]+\+[^\]]+\*8\]/.test(lower)
  )
    out.push("jump-table-like dispatch scale x8")
  if (/jmp\s+dword ptr \[[^\]]+\+[^\]]+\*4\]/.test(lower)) out.push("jump-table-like dispatch scale x4")
  return uniq(out)
}

function dispatcherIndexModels(text: string) {
  const lower = text.toLowerCase()
  const out: string[] = []
  if (/and\s+\w+,\s*0xf\b/.test(lower) && /shr\s+\w+,\s*4\b/.test(lower))
    out.push("split high/low nibble opcode+operand model")
  if (/movzx\s+\w+,\s*byte ptr/.test(lower)) out.push("byte fetch into zero-extended register")
  if (/and\s+\w+,\s*0xfff\b|and\s+\w+,\s*0x0fff\b/.test(lower)) out.push("masked 12-bit offset/index model")
  if (/lea\s+\w+,\s*\[[^\]]+\+[^\]]+\*(4|8)\]/.test(lower)) out.push("scaled table lookup model")
  return uniq(out)
}

function dispatcherBaseHints(lines: string[]) {
  return uniq(
    lines
      .filter((line) =>
        /lea\s+\w+,\s*\[[^\]]+\]|mov\s+\w+,\s*offset\s+0x[0-9a-f]+|jmp\s+q?word ptr \[[^\]]+\+[^\]]+\*(4|8)\]/i.test(
          line,
        ),
      )
      .slice(0, 10),
  )
}

function linkBoundsToOffsets(handlers: Array<{ name: string; tags: string[]; state_offsets: string[] }>) {
  return handlers
    .filter((h) => h.tags.includes("compare-or-bounds-like") && h.state_offsets.length)
    .slice(0, 12)
    .map((h) => `${h.name}: bounds_on=${h.state_offsets.join("|")}`)
}

export default tool({
  description:
    "CTF PWN VM/bytecode helper: identify dispatcher-style opcode handlers, rough read/write/arithmetic/bounds semantics, and next reduction hints for custom VM/mini-interpreter pwn challenges.",
  args: {
    binary: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative ELF binary path. If provided, objdump is collected automatically."),
    evidence: tool.schema
      .string()
      .optional()
      .describe("Disassembly/decompilation text when no binary path is provided."),
    timeoutMs: tool.schema.number().optional().describe("Timeout per external tool call in ms. Default 12000."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const timeoutMs = Math.max(1000, Math.min(args.timeoutMs ?? 12000, 30000))
    let evidence = String(args.evidence || "")
    let binary = ""
    if (args.binary) {
      const target = resolveInsideWorkspace(context.directory, args.binary)
      binary = target
      evidence = await objdumpWithFallback(context.directory, target, timeoutMs)
    }
    if (evidence.trim().length < 32) return "BLOCK: provide binary=... or evidence=..."

    const lines = splitLines(evidence)
    const fns = functionRanges(lines)
    const dispatcherSignals = detectDispatcherSignals(evidence)
    const opcodeWidthHints = guessOpcodeWidth(evidence)
    const dispatcherModels = dispatcherIndexModels(evidence)
    const dispatcherTableHints = uniq(
      splitLines(evidence)
        .filter((line) =>
          /jmp\s+q?word ptr \[[^\]]+\+[^\]]+\*(4|8)\]|call\s+q?word ptr \[[^\]]+\+[^\]]+\*(4|8)\]/i.test(line),
        )
        .slice(0, 8),
    )
    const dispatcherBase = dispatcherBaseHints(lines)
    const candidateHandlers = fns
      .map((fn) => ({
        name: fn.name,
        tags: classifyHandler(fn.body),
        state_offsets: stateOffsetHints(fn.body),
        risk_score: riskScore(classifyHandler(fn.body)),
        oob_risk_score: oobRiskScore(classifyHandler(fn.body), stateOffsetHints(fn.body)),
        sample: fn.body.slice(0, 6).join("\n"),
      }))
      .filter((fn) => fn.tags.length)
      .sort((a, b) => b.oob_risk_score - a.oob_risk_score)
      .slice(0, 24)

    const readHandlers = candidateHandlers.filter((x) => x.tags.includes("read-like")).map((x) => x.name)
    const writeHandlers = candidateHandlers.filter((x) => x.tags.includes("write-like")).map((x) => x.name)
    const arithmeticHandlers = candidateHandlers.filter((x) => x.tags.includes("arithmetic-like")).map((x) => x.name)
    const boundsCheckSignals = candidateHandlers
      .filter((x) => x.tags.includes("compare-or-bounds-like") || x.tags.includes("mask-or-bounds-width-hint"))
      .map((x) => `${x.name}: ${x.tags.join(",")}`)
    const stateSlotClusters = detectStateSlotClusters(candidateHandlers)
    const boundsToOffsets = linkBoundsToOffsets(candidateHandlers)
    const highRiskPaths = candidateHandlers
      .filter(
        (x) =>
          x.tags.includes("write-like") ||
          (x.tags.includes("read-like") && x.tags.includes("mask-or-bounds-width-hint")),
      )
      .slice(0, 8)
      .map(
        (x) =>
          `${x.name}: oob_risk=${x.oob_risk_score} tags=${x.tags.join(",")}${x.state_offsets.length ? ` offsets=${x.state_offsets.join("|")}` : ""}`,
      )

    const payload = {
      schema_version: "pwn_vm_bytecode_helper.v1",
      binary,
      dispatcher_signals: dispatcherSignals,
      dispatcher_models: dispatcherModels,
      dispatcher_table_hints: dispatcherTableHints,
      dispatcher_base_hints: dispatcherBase,
      opcode_width_hints: opcodeWidthHints,
      candidate_handlers: candidateHandlers.map((x) => ({
        name: x.name,
        tags: x.tags,
        state_offsets: x.state_offsets,
        risk_score: x.risk_score,
        oob_risk_score: x.oob_risk_score,
      })),
      read_handlers: readHandlers,
      write_handlers: writeHandlers,
      arithmetic_handlers: arithmeticHandlers,
      bounds_check_signals: boundsCheckSignals,
      state_slot_clusters: stateSlotClusters,
      bounds_to_offsets: boundsToOffsets,
      high_risk_paths: highRiskPaths,
      likely_state_layout_hints: uniq([
        readHandlers.length ? "handlers read from VM state or bytecode-controlled memory" : "",
        writeHandlers.length ? "handlers write back into VM state or memory region" : "",
        boundsCheckSignals.length ? "bounds/mask checks likely gate offset width or memory window" : "",
        stateSlotClusters.length
          ? "multiple handlers share state slots; prioritize overlapping read/write + bounds clusters"
          : "",
        boundsToOffsets.length
          ? "bounds-like handlers touch concrete state slots; compare these against write-like offsets for OOB candidates"
          : "",
      ]),
      recommended_next: dispatcherSignals.length
        ? "Identify opcode fetch and one read-like + one write-like handler first; then test whether bounds checks mask low byte / low 12 bits / full offset before exploit planning. Prefer the highest-risk write-like handler whose state offsets overlap with compare/mask logic, dispatcher index models, or shared state-slot clusters."
        : "Need stronger VM/dispatcher evidence; extract more disassembly around indirect jumps, switch-like branches, or handler tables.",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_vm_bytecode_helper:",
      `binary: ${payload.binary || "none"}`,
      "dispatcher_signals:",
      ...(payload.dispatcher_signals.length ? payload.dispatcher_signals.map((x) => `- ${x}`) : ["- none"]),
      "dispatcher_models:",
      ...(payload.dispatcher_models.length ? payload.dispatcher_models.map((x) => `- ${x}`) : ["- none"]),
      "dispatcher_table_hints:",
      ...(payload.dispatcher_table_hints.length ? payload.dispatcher_table_hints.map((x) => `- ${x}`) : ["- none"]),
      "dispatcher_base_hints:",
      ...(payload.dispatcher_base_hints.length ? payload.dispatcher_base_hints.map((x) => `- ${x}`) : ["- none"]),
      "opcode_width_hints:",
      ...(payload.opcode_width_hints.length ? payload.opcode_width_hints.map((x) => `- ${x}`) : ["- none"]),
      "candidate_handlers:",
      ...(payload.candidate_handlers.length
        ? payload.candidate_handlers.map(
            (x) =>
              `- ${x.name}: risk=${x.risk_score} oob_risk=${x.oob_risk_score} tags=${x.tags.join(",")}${x.state_offsets.length ? ` offsets=${x.state_offsets.join("|")}` : ""}`,
          )
        : ["- none"]),
      "read_handlers:",
      ...(payload.read_handlers.length ? payload.read_handlers.map((x) => `- ${x}`) : ["- none"]),
      "write_handlers:",
      ...(payload.write_handlers.length ? payload.write_handlers.map((x) => `- ${x}`) : ["- none"]),
      "arithmetic_handlers:",
      ...(payload.arithmetic_handlers.length ? payload.arithmetic_handlers.map((x) => `- ${x}`) : ["- none"]),
      "bounds_check_signals:",
      ...(payload.bounds_check_signals.length ? payload.bounds_check_signals.map((x) => `- ${x}`) : ["- none"]),
      "state_slot_clusters:",
      ...(payload.state_slot_clusters.length ? payload.state_slot_clusters.map((x) => `- ${x}`) : ["- none"]),
      "bounds_to_offsets:",
      ...(payload.bounds_to_offsets.length ? payload.bounds_to_offsets.map((x) => `- ${x}`) : ["- none"]),
      "high_risk_paths:",
      ...(payload.high_risk_paths.length ? payload.high_risk_paths.map((x) => `- ${x}`) : ["- none"]),
      "likely_state_layout_hints:",
      ...(payload.likely_state_layout_hints.length
        ? payload.likely_state_layout_hints.map((x) => `- ${x}`)
        : ["- none"]),
      `recommended_next: ${payload.recommended_next}`,
    ].join("\n")
  },
})
