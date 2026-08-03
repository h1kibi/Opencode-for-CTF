import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { rebuildHybridPe, parsePe } from "../lib/pe-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

function normalizeRel(input: string) {
  return input.replace(/\\/g, "/")
}

function compact(text: string, max = 12000) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.6))
  const tail = text.slice(text.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${text.length - max} chars]...\n${tail}`
}

export default tool({
  description:
    "CTF PE hybrid rebuild: combine the original on-disk PE headers/imports/resources with runtime-dumped memory sections, producing a more ReVa/Ghidra-friendly analyzable PE than a pure memory rebuild.",
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
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const original = resolveFromDirectoryInsideWorkspace(directory, workspace, args.original)
    const memoryImage = resolveFromDirectoryInsideWorkspace(directory, workspace, args.memoryImage)
    const outDir = resolveInsideWorkspace(workspace, args.outDir || "work/rev-hybrid-rebuild")
    await mkdir(outDir, { recursive: true })

    const originalBuf = await readFile(original)
    const memoryBuf = await readFile(memoryImage)
    const originalPe = parsePe(originalBuf)
    if (!originalPe) throw new Error("original is not a valid PE/MZ file")
    if (!parsePe(memoryBuf)) throw new Error("memoryImage is not a valid PE/MZ file")

    const preferMemorySections = new Set(
      (args.sections || "")
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    )
    const rebuilt = rebuildHybridPe(originalBuf, memoryBuf, { preferMemorySections })
    const baseName = path.basename(original).replace(/\.exe$/i, "") || "hybrid"
    const outputName = `${baseName}_hybrid_unpacked.exe`
    const outputFile = path.join(outDir, outputName)
    await writeFile(outputFile, rebuilt)

    const payload = {
      schema_version: "ctf_pe_hybrid_rebuild.v1",
      original,
      memory_image: memoryImage,
      output: normalizeRel(path.relative(directory, outputFile)),
      output_size: rebuilt.length,
      original_pe: {
        image_base: `0x${originalPe.imageBase.toString(16)}`,
        entry_point_rva: `0x${originalPe.entryPointRva.toString(16)}`,
        sections: originalPe.sections.map((section) => section.name),
      },
      forced_memory_sections: preferMemorySections.size ? [...preferMemorySections] : [],
      next_actions: [
        "Run ctf-rev-pe-recovery on the hybrid PE for .pdata/prologue function seeds and batched linear disassembly.",
        "Run ctf-memstr on the hybrid PE if runtime-only strings are still relevant.",
        "Open the hybrid PE in IDA/ReVa/Ghidra; prefer it over the pure memory rebuild.",
      ],
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return compact(
      [
        "CTF_PE_HYBRID_REBUILD:",
        `- original: ${original}`,
        `- memory_image: ${memoryImage}`,
        `- output: ${payload.output}`,
        `- output_size: ${rebuilt.length}`,
        `- image_base: ${payload.original_pe.image_base}`,
        `- forced_memory_sections: ${payload.forced_memory_sections.join(", ") || "none"}`,
        "next_actions:",
        ...payload.next_actions.map((line) => `- ${line}`),
      ].join("\n"),
    )
  },
})
