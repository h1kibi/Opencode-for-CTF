import { tool } from "@opencode-ai/plugin"
import { createRuntimeClient } from "../src/sdk.ts"
import { ensureSkillMcpLeases, listSkillMcpLeases, releaseSkillMcpLeases } from "../src/skill-mcp-manager.ts"

export default tool({
  description:
    "CTF skill-embedded MCP lifecycle: activate, release, or inspect dynamic MCP leases for skills on a per-session basis.",
  args: {
    operation: tool.schema.string().describe("activate | release | list | release_all_session"),
    skillName: tool.schema
      .string()
      .optional()
      .describe("Skill name for activate/release, e.g. ctf-web-java or ctf-seckb."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const client = createRuntimeClient(context.directory)

    if (args.operation === "activate") {
      if (!args.skillName) return "BLOCK: skillName is required for activate"
      const result = await ensureSkillMcpLeases({
        client,
        worktree: context.worktree,
        directory: context.directory,
        sessionID: context.sessionID,
        skillName: args.skillName,
      })
      const payload = {
        operation: "activate",
        sessionID: context.sessionID,
        skillName: args.skillName,
        activated: result.activated,
        shared: result.shared,
        totalBindings: result.totalBindings,
      }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : [
            "skill_mcp_lifecycle:",
            "operation: activate",
            `sessionID: ${context.sessionID}`,
            `skillName: ${args.skillName}`,
            `activated: ${result.activated.length ? result.activated.join(", ") : "none"}`,
            `shared: ${result.shared.length ? result.shared.join(", ") : "none"}`,
            `total_bindings: ${result.totalBindings}`,
          ].join("\n")
    }

    if (args.operation === "release") {
      if (!args.skillName) return "BLOCK: skillName is required for release"
      const result = await releaseSkillMcpLeases({
        client,
        worktree: context.worktree,
        directory: context.directory,
        sessionID: context.sessionID,
        skillName: args.skillName,
      })
      const payload = {
        operation: "release",
        sessionID: context.sessionID,
        skillName: args.skillName,
        released: result.released,
        retained: result.retained,
        skipped: result.skipped,
      }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : [
            "skill_mcp_lifecycle:",
            "operation: release",
            `sessionID: ${context.sessionID}`,
            `skillName: ${args.skillName}`,
            `released: ${result.released.length ? result.released.join(", ") : "none"}`,
            `retained: ${result.retained.length ? result.retained.join(", ") : "none"}`,
            `skipped: ${result.skipped.length ? result.skipped.join(", ") : "none"}`,
          ].join("\n")
    }

    if (args.operation === "release_all_session") {
      const result = await releaseSkillMcpLeases({
        client,
        worktree: context.worktree,
        directory: context.directory,
        sessionID: context.sessionID,
      })
      const payload = {
        operation: "release_all_session",
        sessionID: context.sessionID,
        released: result.released,
        retained: result.retained,
        skipped: result.skipped,
      }
      return args.jsonOnly
        ? JSON.stringify(payload, null, 2)
        : [
            "skill_mcp_lifecycle:",
            "operation: release_all_session",
            `sessionID: ${context.sessionID}`,
            `released: ${result.released.length ? result.released.join(", ") : "none"}`,
            `retained: ${result.retained.length ? result.retained.join(", ") : "none"}`,
            `skipped: ${result.skipped.length ? result.skipped.join(", ") : "none"}`,
          ].join("\n")
    }

    const state = await listSkillMcpLeases(context.worktree)
    return args.jsonOnly
      ? JSON.stringify(state, null, 2)
      : [
          "skill_mcp_lifecycle:",
          "operation: list",
          `leases: ${state.leases.length}`,
          ...state.leases.map(
            (lease) =>
              `- session=${lease.sessionID} skill=${lease.skillName} server=${lease.serverName} connected=${lease.connected} idle_release=${lease.disconnectWhenIdle ?? true}`,
          ),
        ].join("\n")
  },
})
