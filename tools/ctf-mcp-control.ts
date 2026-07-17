import { tool } from "@opencode-ai/plugin"
import { createRuntimeClient } from "../src/sdk.ts"
import {
  approveRequest,
  denyRequest,
  getAgentMcpState,
  listAllRequests,
  listPendingRequests,
} from "../src/dynamic-mcp-manager.ts"
import { lookupMcpServer } from "../src/mcp-server-registry.ts"

/**
 * Expert-side control plane for dynamic MCP requests.
 * Subagents request via ctf-dynamic-mcp-advisor; ctf-expert approves/denies here.
 */
export default tool({
  description:
    "ctf-expert MCP control: list pending heavy/cross-category MCP requests, approve or deny them. Subagents request via ctf-dynamic-mcp-advisor.",
  args: {
    action: tool.schema
      .enum(["list-pending", "list-all", "approve", "deny", "status"])
      .describe("list-pending | list-all | approve | deny | status"),
    requestId: tool.schema.string().optional().describe("Request id (required for approve/deny)"),
    note: tool.schema.string().optional().describe("Decision note recorded on the request and useful for Evidence.md"),
  },
  async execute(args, context) {
    const worktree = context.worktree ?? context.directory ?? process.cwd()
    const directory = context.directory ?? process.cwd()

    if (args.action === "list-pending") {
      const pending = await listPendingRequests(worktree)
      if (!pending.length) return "pending_requests: 0\n(No action needed — poll again after each team wave / worker request.)"
      const lines = [
        `pending_requests: ${pending.length}`,
        "⏱ Approve/deny NOW before the next ctf-team-dispatch so workers still running can use the MCP.",
        "Do not wait for session.idle auto-approve (that only covers light/medium same-category).",
      ]
      for (const r of pending) {
        const meta = lookupMcpServer(r.serverName)
        const weight = meta?.weight ?? "unknown"
        lines.push(
          `  id=${r.id} agent=${r.agent} mcp=${r.serverName} [${weight}] session=${r.sessionID.slice(0, 12)} reason="${r.reason}"`,
        )
      }
      lines.push("")
      lines.push("Approve only when a current route clearly needs this MCP and no lighter alternative exists.")
      lines.push("Use action=approve requestId=... or action=deny requestId=... note=...")
      return lines.join("\n")
    }

    if (args.action === "list-all") {
      const all = await listAllRequests(worktree)
      if (!all.length) return "requests: 0"
      const lines = [`requests: ${all.length}`]
      for (const r of all) {
        lines.push(
          `  id=${r.id} status=${r.status} agent=${r.agent} mcp=${r.serverName} by=${r.decidedBy ?? "-"} reason="${r.reason}"`,
        )
      }
      return lines.join("\n")
    }

    if (args.action === "status") {
      const state = await getAgentMcpState(worktree)
      const lines = [
        `profiles: ${state.activeProfiles.length}`,
        `requests: ${state.requests.length}`,
        `pending: ${state.requests.filter((r) => r.status === "pending").length}`,
      ]
      for (const p of state.activeProfiles) {
        lines.push(`  agent=${p.agent} session=${p.sessionID.slice(0, 12)} mcp=[${p.serverNames.join(", ")}]`)
      }
      return lines.join("\n")
    }

    if (args.action === "approve") {
      if (!args.requestId) return "ERROR: approve requires requestId"
      const client = createRuntimeClient(directory)
      const result = await approveRequest({
        client,
        worktree,
        directory,
        requestId: args.requestId,
        decidedBy: "ctf-expert",
        note: args.note,
      })
      if (!result.ok) {
        return `ERROR: approve failed — ${result.reason ?? "unknown"}`
      }
      return [
        `✅ approved mcp=${result.serverName}`,
        `   agent=${result.agent ?? "?"} session=${(result.sessionID ?? "").slice(0, 12)}`,
        `   lease_skill=${result.skillName ?? ""}`,
        args.note ? `   note=${args.note}` : "",
        "Record the decision in Evidence.md if this unblocks a route.",
      ]
        .filter(Boolean)
        .join("\n")
    }

    if (args.action === "deny") {
      if (!args.requestId) return "ERROR: deny requires requestId"
      await denyRequest({
        worktree,
        requestId: args.requestId,
        decidedBy: "ctf-expert",
        note: args.note ?? "denied by ctf-expert",
      })
      return [
        `🚫 denied requestId=${args.requestId}`,
        args.note ? `   note=${args.note}` : "   note=denied by ctf-expert",
        "Record denial + lighter alternative in Evidence.md.",
      ].join("\n")
    }

    return `ERROR: unknown action "${args.action}"`
  },
})
