import { tool } from "@opencode-ai/plugin"
import { mkdir } from "node:fs/promises"
import { resolveInsideWorkspace, workspaceRootFromContext } from "../lib/workspace-path.ts"

export default tool({
  description:
    "CTF ensure dir: create a workspace-local directory recursively when the generic filesystem helper is too strict.",
  args: {
    path: tool.schema.string().describe("Workspace-relative directory path to ensure."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const target = resolveInsideWorkspace(workspace, args.path)
    await mkdir(target, { recursive: true })
    const payload = { ok: true, path: target, createdRecursively: true }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return ["CTF_ENSURE_DIR:", "- ok: true", `- path: ${target}`, "- created_recursively: true"].join("\n")
  },
})
