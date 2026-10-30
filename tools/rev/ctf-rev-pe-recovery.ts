import { tool } from "@opencode-ai/plugin"
export default tool({
  description:
    "CTF rebuilt-PE recovery entrypoint: PE section and .pdata analysis is delegated to a format-aware external tool.",
  args: {
    target: tool.schema.string().describe("Workspace-relative PE file path (on-disk or rebuilt from memory)."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/rev-pe-recovery."),
    linear: tool.schema.boolean().optional().describe("Run bounded objdump linear disassembly batches. Default false."),
    sectionName: tool.schema
      .string()
      .optional()
      .describe("Section to disassemble. Default first executable section (.text)."),
    startRva: tool.schema.string().optional().describe("Hex start RVA for linear disassembly, e.g. 0x1000."),
    endRva: tool.schema.string().optional().describe("Hex end RVA for linear disassembly."),
    chunkSize: tool.schema.number().optional().describe("Batch size in bytes. Default 65536."),
    maxChunks: tool.schema.number().optional().describe("Maximum objdump batches. Default 64."),
    fallback: tool.schema.boolean().optional().describe("Enable prologue fallback when .pdata is empty. Default true."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute() {
    throw new Error(
      "ctf-rev-pe-recovery cannot parse PE section tables internally; use Ghidra, dumpbin, llvm-readobj, or another format-aware external PE tool",
    )
  },
})
