import { tool } from "@opencode-ai/plugin"
export default tool({
  description:
    "CTF PE unpack entrypoint: static packer detection and runtime dumping require an external format-aware PE tool.",
  args: {
    target: tool.schema.string().describe("Workspace-relative PE file path."),
    launch: tool.schema
      .boolean()
      .optional()
      .describe("Launch target for runtime dump when pid/processName is not supplied. Default false."),
    launchArgs: tool.schema.string().optional().describe("Arguments passed to the launched target."),
    processName: tool.schema.string().optional().describe("Already-running process name to dump."),
    pid: tool.schema.number().optional().describe("Already-running process id to dump."),
    mode: tool.schema.string().optional().describe("Forwarded runtime dump mode: pe | all | range. Default pe."),
    startAddress: tool.schema.string().optional().describe("Hex start address for range mode."),
    size: tool.schema.string().optional().describe("Hex size for range mode."),
    outDir: tool.schema
      .string()
      .optional()
      .describe("Workspace-relative output directory. Default work/rev-runtime-dump."),
    mainOnly: tool.schema.boolean().optional().describe("Dump only the main executable module. Default true."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute() {
    throw new Error(
      "ctf-pe-unpack cannot parse PE section tables internally; use an external PE inspection tool (e.g. dumpbin, llvm-readobj, or Ghidra)",
    )
  },
})
