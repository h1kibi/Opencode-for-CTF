import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

export default tool({
  description:
    "CTF pwn disasm constraint map: turn objdump/source evidence into stack-layout hints, checker-style comparison gates, and overwrite-path pressure for disguised stack-smash branches.",
  args: {
    binary: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative ELF binary path. If provided, objdump is collected automatically."),
    evidence: tool.schema
      .string()
      .optional()
      .describe("Source snippet, decompilation, or disassembly text when no binary path is provided."),
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
      const objdumpR = await safeExec("objdump", ["-d", "-M", "intel", target], path.dirname(target), timeoutMs)
      evidence = objdumpR.output
    }
    if (evidence.trim().length < 16) return "BLOCK: provide binary=... or evidence=..."
    const analysis = analyzePwnDisasmText(evidence)
    const payload = {
      schema_version: "pwn_disasm_constraint_map.v1",
      binary,
      red_flag_tags: analysis.redFlagTags,
      red_flag_notes: analysis.redFlagNotes,
      stack_layout_hints: analysis.stackLayoutHints,
      constraint_hints: analysis.constraintHints,
      route_pressure: analysis.routePressure,
      next_focus: analysis.redFlagTags.length
        ? "prefer one-packet overwrite, terminator side-effect, and loop-index corruption probes before broad symbolic or gadget drift"
        : "use the stack layout and cmp chain to decide whether this is really a checker or just a normal bounded parser",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_disasm_constraint_map:",
      `binary: ${payload.binary || "none"}`,
      "red_flag_tags:",
      ...(payload.red_flag_tags.length ? payload.red_flag_tags.map((x: string) => `- ${x}`) : ["- none"]),
      "red_flag_notes:",
      ...(payload.red_flag_notes.length ? payload.red_flag_notes.map((x: string) => `- ${x}`) : ["- none"]),
      "stack_layout_hints:",
      ...(payload.stack_layout_hints.length ? payload.stack_layout_hints.map((x: string) => `- ${x}`) : ["- none"]),
      "constraint_hints:",
      ...(payload.constraint_hints.length ? payload.constraint_hints.map((x: string) => `- ${x}`) : ["- none"]),
      "route_pressure:",
      ...(payload.route_pressure.length ? payload.route_pressure.map((x: string) => `- ${x}`) : ["- none"]),
      `next_focus: ${payload.next_focus}`,
    ].join("\n")
  },
})
