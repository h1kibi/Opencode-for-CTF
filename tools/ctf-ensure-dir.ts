import { tool } from "@opencode-ai/plugin"
import { mkdir } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

export default tool({
  description: "CTF ensure dir: create a workspace-local directory recursively when the generic filesystem helper is too strict.",
  args: {
    path: tool.schema.string().describe("Workspace-relative directory path to ensure."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.path)
    await mkdir(target, { recursive: true })
    const payload = { ok: true, path: target, createdRecursively: true }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_ENSURE_DIR:",
      "- ok: true",
      `- path: ${target}`,
      "- created_recursively: true",
    ].join("\n")
  },
})
