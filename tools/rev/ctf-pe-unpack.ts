import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import { parsePe } from "../lib/pe-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import runtimeDump from "./ctf-runtime-dump.ts"

const PACKER_SECTION_RE = /^(\.?upx[0-9]*|\.aspack|\.vmp[0-9]*|\.themida|\.enigma|nsp[0-9]*|\.mpress|\.petite|packed)$/i
const PACKER_STRING_RE = /UPX!|ASPack|VMProtect|Themida|Enigma|MPRESS|Petite|packed with|packer/i

function compact(text: string, max = 12000) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.6))
  const tail = text.slice(text.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${text.length - max} chars]...\n${tail}`
}

function detectPacker(buf: Buffer) {
  const pe = parsePe(buf)
  if (!pe) return { pe: false, signals: [] as string[], verdict: "not-pe" as const }
  const signals: string[] = []
  for (const section of pe.sections) {
    if (PACKER_SECTION_RE.test(section.name)) {
      signals.push(`packer_section:${section.name}`)
    }
    if (section.entropy > 7.2) {
      signals.push(`high_entropy_section:${section.name}:${section.entropy}`)
    }
  }
  const text = buf.subarray(0, Math.min(buf.length, 8 * 1024 * 1024)).toString("latin1")
  const matches = text.match(PACKER_STRING_RE)
  if (matches) signals.push(`packer_string:${matches[0].slice(0, 32)}`)
  const verdict = signals.length ? ("packed_likely" as const) : ("clean_likely" as const)
  return { pe: true, signals, verdict }
}

export default tool({
  description:
    "CTF PE unpack facade: detect packer/section/entropy signals on a PE, then optionally launch or attach to the process and call ctf-runtime-dump to dump memory and rebuild an analyzable PE.",
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
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const buf = await readFile(target)
    const detection = detectPacker(buf)
    if (!detection.pe) throw new Error("target is not a valid PE/MZ file")

    const dumpArgs: Record<string, unknown> = {
      mode: args.mode || "pe",
      startAddress: args.startAddress,
      size: args.size,
      outDir: args.outDir,
      mainOnly: args.mainOnly,
      processName: args.processName,
      pid: args.pid,
      launchArgs: args.launchArgs,
      jsonOnly: args.jsonOnly,
    }
    if (args.launch && !args.pid && !args.processName) {
      dumpArgs.launchTarget = target
    }

    let runtime: unknown = null
    if (args.launch || args.pid || args.processName) {
      const toolContext = { directory, worktree: workspace } as never
      runtime = await runtimeDump.execute(dumpArgs as never, toolContext)
    }

    const payload = {
      schema_version: "ctf_pe_unpack.v1",
      target,
      pe: true,
      verdict: detection.verdict,
      signals: detection.signals,
      runtime_dump: runtime,
      next_actions:
        detection.verdict === "packed_likely"
          ? [
              "Run with launch=true (or attach to the running process) to dump the in-memory image.",
              "After dump, run ctf-rev-pe-recovery on the rebuilt PE for .pdata function seeds and batched linear disassembly.",
              "Run ctf-memstr on the dumped module files to prioritize checker strings.",
            ]
          : [
              "Static PE appears unpacked; start with ctf-rev-analyze / ctf-rev-pe-slice before runtime work.",
              "If the on-disk header is still a stub, use ctf-runtime-dump to rebuild the full image.",
            ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return compact(
      [
        "CTF_PE_UNPACK:",
        `- target: ${target}`,
        `- verdict: ${detection.verdict}`,
        `- signals: ${detection.signals.length ? detection.signals.join(", ") : "none"}`,
        "- next_actions:",
        ...payload.next_actions.map((line) => `  - ${line}`),
        "- runtime_dump:",
        runtime
          ? String(runtime)
              .split(/\r?\n/)
              .map((line) => `  ${line}`)
              .join("\n")
          : "  skipped (set launch=true or pid/processName)",
      ].join("\n"),
    )
  },
})
