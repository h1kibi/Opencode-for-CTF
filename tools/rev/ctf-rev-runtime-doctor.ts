import { access } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"
import { resolveInsideWorkspace, workspaceRootFromContext } from "../lib/workspace-path.ts"
import { recordRuntimeDoctor, readRuntimeSession, resolveRuntimeSessionFile } from "../lib/rev-runtime-session-store.ts"
import { runRevRuntimeDoctor } from "../lib/rev-runtime-doctor.ts"

function rel(from: string, file: string) {
  return file.replace(from, "").replace(/^[/\\]+/, "").replace(/\\/g, "/")
}

export default tool({
  description:
    "Read-only CTF rev runtime doctor. It probes fixed tool versions and runtime capabilities only; it never opens, executes, emulates, or sends the challenge target anywhere.",
  args: {
    sessionPath: tool.schema.string().optional().describe("Optional workspace-relative rev runtime session to receive the doctor record."),
    record: tool.schema.boolean().optional().describe("Persist the doctor result into sessionPath. Default false."),
    timeoutMs: tool.schema.number().optional().describe("Per-probe timeout in milliseconds; capped by the implementation."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const doctor = await runRevRuntimeDoctor({ cwd: workspace, timeoutMs: Math.min(Math.max(args.timeoutMs ?? 3500, 500), 10000) })
    let sessionPath: string | null = null
    let session = null
    if (args.record) {
      if (!args.sessionPath) throw new Error("record=true requires sessionPath")
      sessionPath = resolveInsideWorkspace(workspace, args.sessionPath)
      await access(sessionPath).catch(() => { throw new Error(`runtime session not found: ${rel(workspace, sessionPath!)}`) })
      session = await recordRuntimeDoctor(sessionPath, workspace, doctor as unknown as Record<string, unknown>)
    } else if (args.sessionPath) {
      sessionPath = resolveRuntimeSessionFile(workspace, args.sessionPath)
      await access(sessionPath).catch(() => undefined)
      if (await access(sessionPath).then(() => true).catch(() => false)) session = await readRuntimeSession(sessionPath, workspace)
    }
    const payload = {
      schema_version: "rev_runtime_doctor.v1",
      doctor,
      ...(sessionPath ? { session_path: rel(workspace, sessionPath!) } : {}),
      ...(session ? { session } : {}),
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "ctf-rev-runtime-doctor:",
      `- status: ${doctor.status}`,
      `- capabilities: ${doctor.capabilities.join(", ") || "none"}`,
      `- available checks: ${doctor.checks.filter((check) => check.status === "available").length}/${doctor.checks.length}`,
      `- issues: ${doctor.issues.length ? doctor.issues.join("; ") : "none"}`,
      ...(sessionPath ? [`- session_path: ${rel(workspace, sessionPath!)}`, `- recorded: ${Boolean(session)}`] : []),
      "- safety: fixed read-only probes; challenge execution disabled",
    ].join("\n")
  },
})