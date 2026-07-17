import { tool } from "@opencode-ai/plugin"
import { analyzePwnDisasmText } from "./lib/pwn-disasm-analysis.ts"

export default tool({
  description:
    "CTF pwn red-flag panel: detect checker-disguised stack smash patterns such as off-by-null, single-byte stack writes, loop-index clobber, and one-packet frame overwrite risk from source or disassembly evidence.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Source snippet, decompilation, disassembly, or notes describing the stack/input logic."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    if (text.trim().length < 16) return "BLOCK: provide source, decompilation, disassembly, or stack/input notes"
    const analysis = analyzePwnDisasmText(text)
    const risks = analysis.redFlagNotes.length
      ? analysis.redFlagNotes
      : ["no high-confidence checker-disguised stack-smash pattern detected from the current evidence"]
    const actions = [
      "lock the input contract first: exact read size, newline retention, and whether one send can fill the whole stack buffer",
      "prefer ctf-elf-slice stack_layout_hints plus one focused ctf-pwn-gdb-snapshot over hand-copied offset notes when the frame layout is unclear",
      ...analysis.routePressure,
    ]
    const payload = {
      schema_version: "pwn_redflag_panel.v1",
      signals: analysis.redFlagTags,
      risks,
      recommended_actions: actions,
      stack_layout_hints: analysis.stackLayoutHints,
      constraint_hints: analysis.constraintHints,
      route_pressure: analysis.routePressure.length
        ? analysis.routePressure.join(" | ")
        : "keep current lane until stronger stack-smash evidence appears",
      stop_rule:
        "If one exact-size packet can explain buffer fill, terminator write, index drift, and frame corruption together, test that unified overwrite model before expanding into slower symbolic-constraint branches.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_redflag_panel:",
      "signals:",
      ...(analysis.redFlagTags.length ? analysis.redFlagTags.map((x: string) => `- ${x}`) : ["- none"]),
      "risks:",
      ...risks.map((x) => `- ${x}`),
      "stack_layout_hints:",
      ...(analysis.stackLayoutHints.length ? analysis.stackLayoutHints.map((x: string) => `- ${x}`) : ["- none"]),
      "constraint_hints:",
      ...(analysis.constraintHints.length ? analysis.constraintHints.map((x: string) => `- ${x}`) : ["- none"]),
      "recommended_actions:",
      ...actions.map((x) => `- ${x}`),
      `route_pressure: ${payload.route_pressure}`,
      `stop_rule: ${payload.stop_rule}`,
    ].join("\n")
  },
})
