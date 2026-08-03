import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { formatMemoryStringHit, scanMemoryStrings, type MemoryStringEncoding } from "../lib/mem-str.ts"

const VALID_ENCODINGS = new Set(["ascii", "utf16le", "utf16be", "both"])

function compact(text: string, max = 12000) {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.6))
  const tail = text.slice(text.length - Math.floor(max * 0.4))
  return `${head}\n...[truncated ${text.length - max} chars]...\n${tail}`
}

async function collectDumpFiles(target: string, maxFiles: number): Promise<string[]> {
  const st = await lstat(target)
  if (st.isFile()) return [target]
  if (!st.isDirectory()) throw new Error("target must be a file or directory")

  const entries = await readdir(target, { withFileTypes: true, recursive: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || files.length >= maxFiles) continue
    files.push(path.join(entry.parentPath ?? target, entry.name))
  }
  return files
}

export default tool({
  description:
    "CTF memory string extractor: scan raw memory dumps or dump directories for ASCII and UTF-16LE/BE strings with byte offsets, tolerant output, and bounded hit counts.",
  args: {
    target: tool.schema.string().describe("Workspace-relative memory dump file or directory to scan."),
    encoding: tool.schema.string().optional().describe("ascii | utf16le | utf16be | both. Default both."),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Optional regex filter applied to decoded strings, e.g. flag|CTF|http."),
    minLength: tool.schema.number().optional().describe("Minimum string length in code units. Default 4."),
    maxHits: tool.schema.number().optional().describe("Maximum hits to return. Default 500, hard cap 5000."),
    maxFiles: tool.schema
      .number()
      .optional()
      .describe("Maximum files scanned when target is a directory. Default 200."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const encodingRaw = (args.encoding || "both").toLowerCase()
    if (!VALID_ENCODINGS.has(encodingRaw)) {
      throw new Error(`unsupported encoding: ${args.encoding}; expected ascii, utf16le, utf16be, or both`)
    }
    const encoding = encodingRaw as MemoryStringEncoding
    const minLength = Math.max(2, Math.min(args.minLength ?? 4, 64))
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 500, 5000))
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 200, 1000))
    const pattern = args.pattern ? new RegExp(args.pattern, "i") : undefined
    const files = await collectDumpFiles(target, maxFiles)
    if (!files.length) throw new Error("no files found under target")

    const hits: Array<
      {
        file: string
      } & ReturnType<typeof scanMemoryStrings>[number]
    > = []
    let scannedBytes = 0
    let scannedFiles = 0

    for (const file of files) {
      const st = await lstat(file)
      if (!st.isFile()) continue
      const buf = await readFile(file)
      scannedBytes += buf.length
      scannedFiles++
      const rel = path.relative(directory, file).replace(/\\/g, "/")
      for (const hit of scanMemoryStrings(buf, { encoding, minLength, maxHits: maxHits - hits.length, pattern })) {
        hits.push({ file: rel, ...hit })
        if (hits.length >= maxHits) break
      }
      if (hits.length >= maxHits) break
    }

    const summary = {
      target,
      files: scannedFiles,
      scanned_bytes: scannedBytes,
      encoding,
      min_length: minLength,
      hits: hits.length,
      truncated: hits.length >= maxHits,
      strings: hits,
    }

    if (args.jsonOnly) return JSON.stringify(summary, null, 2)

    const lines = hits.map((hit) => `- ${formatMemoryStringHit(hit, hit.file)}`)
    return compact(
      [
        "CTF_MEMSTR:",
        `- target: ${target}`,
        `- files: ${scannedFiles}`,
        `- scanned_bytes: ${scannedBytes}`,
        `- encoding: ${encoding}`,
        `- hits: ${hits.length}${hits.length >= maxHits ? " (hit limit reached)" : ""}`,
        "strings:",
        ...(lines.length ? lines : ["- none"]),
        "hints:",
        "- Prefer a targeted pattern after the first pass to keep output focused.",
        "- ASCII flags are usually 0x20-0x7e; UTF-16 flags often include interleaved NUL bytes.",
        "- Use ctf-runtime-dump before ctf-memstr when strings only exist after unpacking in memory.",
      ].join("\n"),
    )
  },
})
