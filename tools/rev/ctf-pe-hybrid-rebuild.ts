import { tool } from "@opencode-ai/plugin"
export default tool({
  description:
    "CTF PE hybrid rebuild entrypoint: PE section reconstruction is delegated to a format-aware external tool.",
  args: {
    original: tool.schema.string().describe("Workspace-relative original PE path."),
    memoryImage: tool.schema
      .string()
      .describe("Workspace-relative runtime dump image, e.g. ctf-runtime-dump module .bin or rebuilt memory PE."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/rev-hybrid-rebuild."),
    sections: tool.schema
      .string()
      .optional()
      .describe("Comma-separated section names to force from memory, e.g. .text,.textbss."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute() {
    throw new Error(
      "ctf-pe-hybrid-rebuild cannot parse PE section tables internally; use a format-aware external PE tool (e.g. dumpbin, llvm-readobj, or Ghidra) to rebuild the image",
    )
  },
})
