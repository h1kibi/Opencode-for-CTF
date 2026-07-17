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

function lineHits(text: string) {
  const lines = text.split(/\r?\n/)
  return lines
    .filter((line) =>
      /\b(node|script|text|signal|ext_resource|sub_resource|load_steps|instance|autoload)\b/i.test(line),
    )
    .slice(0, 120)
}

export default tool({
  description:
    "CTF Godot resource direct reader: summarize key textual fields from .tscn/.tres/.import-like files without dumping huge raw content.",
  args: {
    target: tool.schema.string().describe("Workspace-relative .tscn/.tres/.import/.remap/.gd/.txt-like file."),
    maxLines: tool.schema.number().optional().describe("Maximum matched lines to return. Default 120."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const text = (await readFile(target)).toString("utf8", 0, Math.min(st.size, 200000)).replace(/\0/g, "")
    const hits = lineHits(text).slice(0, Math.max(20, Math.min(args.maxLines ?? 120, 300)))
    const payload = {
      target,
      size: st.size,
      hitCount: hits.length,
      hits,
      nextProbe: "Use these key fields to locate linked scripts/resources before wider file browsing.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_GODOT_RESOURCE_READ:",
      `- target: ${target}`,
      `- size: ${st.size}`,
      `- hit_count: ${hits.length}`,
      "- hits:",
      ...hits.map((line) => `  ${line}`),
      `- next_probe: ${payload.nextProbe}`,
    ].join("\n")
  },
})
