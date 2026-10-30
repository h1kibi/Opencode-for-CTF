import { tool } from "@opencode-ai/plugin"

export default tool({
  description:
    "CTF DEX patch mapper: map extract.dat-style dex offsets to class->method code_item owners and patch containment status.",
  args: {
    target: tool.schema.string().describe("Workspace-relative .dex or APK/JAR/ZIP containing classes.dex."),
    dexEntry: tool.schema
      .string()
      .optional()
      .describe("Optional dex entry inside APK/ZIP, e.g. classes2.dex. Default classes.dex / first entry."),
    patchFile: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative patch file with text/JSON or supported binary records."),
    patchFormat: tool.schema
      .string()
      .optional()
      .describe("auto | text | json | u32le_pairs | extract_dat_u32le_pairs. Default auto."),
    patches: tool.schema
      .string()
      .optional()
      .describe("Inline text/JSON patch records. Use when no patchFile is available."),
    maxRows: tool.schema.number().optional().describe("Maximum rows to print. Default 80."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute() {
    throw new Error(
      "DEX method mapping requires an installed structured DEX backend (apktool/dexdump); no supported backend is available",
    )
  },
})
