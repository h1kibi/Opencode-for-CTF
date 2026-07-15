import { tool } from "@opencode-ai/plugin"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function preview(text: string, max = 1200) {
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]...`
}

export default tool({
  description: "CTF source map read: list sources, extract sourcesContent by source name, or search symbols across a .map file without manual scripting.",
  args: {
    target: tool.schema.string().describe("Workspace-relative source map JSON file."),
    operation: tool.schema.string().describe("list | extract | search"),
    sourceName: tool.schema.string().optional().describe("Exact or substring source name for extract."),
    symbol: tool.schema.string().optional().describe("Substring search term for search."),
    maxResults: tool.schema.number().optional().describe("Maximum rows/snippets. Default 50."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const raw = await readFile(target, "utf8")
    const map = JSON.parse(raw) as { sources?: string[]; sourcesContent?: Array<string | null> }
    const sources = map.sources || []
    const contents = map.sourcesContent || []
    const maxResults = Math.max(10, Math.min(args.maxResults ?? 50, 300))

    if (args.operation === "list") {
      const rows = sources.map((src, i) => ({ index: i, source: src, hasContent: typeof contents[i] === "string" }))
      if (args.jsonOnly) return JSON.stringify({ target, count: rows.length, rows: rows.slice(0, maxResults) }, null, 2)
      return ["CTF_SOURCE_MAP_READ:", `- target: ${target}`, `- operation: list`, `- count: ${rows.length}`, "- sources:", ...rows.slice(0, maxResults).map((r) => `  [${r.index}] hasContent=${r.hasContent} ${r.source}`)].join("\n")
    }

    if (args.operation === "extract") {
      const q = args.sourceName || ""
      const hits = sources.map((src, i) => ({ index: i, source: src, content: contents[i] || "" })).filter((row) => q ? row.source.includes(q) : true).slice(0, maxResults)
      const payload = { target, operation: "extract", hits: hits.map((row) => ({ index: row.index, source: row.source, contentPreview: preview(String(row.content || ""), 4000) })) }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return ["CTF_SOURCE_MAP_READ:", `- target: ${target}`, `- operation: extract`, `- hits: ${hits.length}`, ...hits.map((row) => `--- [${row.index}] ${row.source}\n${preview(String(row.content || ""), 1200)}`)].join("\n")
    }

    if (args.operation === "search") {
      const q = args.symbol || ""
      if (!q) throw new Error("symbol is required for search")
      const out: Array<{ index: number; source: string; preview: string }> = []
      for (let i = 0; i < sources.length; i++) {
        const content = String(contents[i] || "")
        if (!content.includes(q)) continue
        const idx = content.indexOf(q)
        const snippet = content.slice(Math.max(0, idx - 200), Math.min(content.length, idx + 600))
        out.push({ index: i, source: sources[i], preview: preview(snippet, 900) })
        if (out.length >= maxResults) break
      }
      const payload = { target, operation: "search", hits: out }
      if (args.jsonOnly) return JSON.stringify(payload, null, 2)
      return ["CTF_SOURCE_MAP_READ:", `- target: ${target}`, `- operation: search`, `- hits: ${out.length}`, ...out.map((row) => `--- [${row.index}] ${row.source}\n${row.preview}`)].join("\n")
    }

    throw new Error(`unsupported operation: ${args.operation}`)
  },
})
