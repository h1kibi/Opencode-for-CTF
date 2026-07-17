import { tool } from "@opencode-ai/plugin"
import { lookupMcpServer, envPrerequisitesSatisfied } from "../src/mcp-server-registry.ts"
import { getAgentDefaults } from "../src/agent-mcp-profiles.ts"
import { getAgentMcpState, listPendingRequests, requestMcp } from "../src/dynamic-mcp-manager.ts"

export default tool({
  description:
    "CTF MCP advisor — check which MCPs are active for your session, discover available servers, or request additional heavy MCPs from ctf-expert.",
  args: {
    action: tool.schema.string().describe("check | request | list-available"),
    serverIds: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Server IDs to request (for action=request)"),
    reason: tool.schema.string().optional().describe("Why you need these MCPs (for action=request)"),
  },
  async execute(args, context) {
    const worktree = context.directory ?? process.cwd()

    if (args.action === "check") {
      const state = await getAgentMcpState(worktree)
      const lines: string[] = [`active_profiles: ${state.activeProfiles.length}`]
      for (const p of state.activeProfiles) {
        lines.push(`  agent=${p.agent} session=${p.sessionID.slice(0, 12)} mcp=[${p.serverNames.join(", ")}]`)
      }
      const pending = state.requests.filter((r) => r.status === "pending")
      if (pending.length) {
        lines.push(`pending_requests: ${pending.length}`)
        for (const r of pending) {
          lines.push(`  id=${r.id} agent=${r.agent} mcp=${r.serverName} reason="${r.reason}"`)
        }
      }
      return lines.join("\n")
    }

    if (args.action === "list-available") {
      const { MCP_SERVER_REGISTRY, serversByWeight } = await import("../src/mcp-server-registry.ts")
      const lines: string[] = ["available_servers:"]
      for (const s of MCP_SERVER_REGISTRY) {
        const prereq = envPrerequisitesSatisfied(s)
        const envOk = prereq.ok ? "" : ` (missing: ${prereq.missing.join(", ")})`
        lines.push(`  ${s.id} [${s.weight}] ${s.group} — ${s.description}${envOk}`)
      }
      return lines.join("\n")
    }

    if (args.action === "request") {
      if (!args.serverIds?.length) {
        return "ERROR: serverIds is required for action=request"
      }
      if (!args.reason) {
        return "ERROR: reason is required for action=request (explain why this MCP is needed)"
      }

      const result = await requestMcp({
        worktree,
        sessionID: context.sessionID ?? "unknown",
        agentName: context.agent ?? "unknown",
        serverNames: args.serverIds,
        reason: args.reason,
      })

      const lines: string[] = [`request_submitted: ${result.requestIds.length}`]
      for (const r of result.results) {
        lines.push(`  ${r.serverName}: ${r.status}`)
      }
      const pendingIds = result.requestIds.length
      if (pendingIds > 0) {
        lines.push("")
        lines.push("Your request has been logged for ctf-expert (ctf-mcp-control).")
        lines.push("Continue with currently available tools/MCPs until approval.")
        lines.push(
          "Parent expert should approve on the next synthesize tick — do not block forever waiting.",
        )
      }
      return lines.join("\n")
    }

    return `ERROR: unknown action "${args.action}". Valid: check, request, list-available`
  },
})
