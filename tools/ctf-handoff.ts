import { tool } from "@opencode-ai/plugin"
import { loadPluginConfig } from "../src/plugin-config.ts"
import { formatHardRouteHandoff, planRoute, primaryAgentForDecision } from "../src/route-runtime.ts"
import { rememberSessionSurface } from "../src/session-surface.ts"

/**
 * Hard lane handoff for /ctf when the command agent stays ctf-fast but the
 * BINDING route is expert (or the reverse). Updates session tool surface and
 * returns the expert/fast contract the model must adopt immediately.
 */
export default tool({
  description:
    "Hard handoff between ctf-fast and ctf-expert lanes. Call when /ctf BINDING route or ctf-route-plan says a different primary than the current agent. Updates session tool surface.",
  args: {
    lane: tool.schema.enum(["fast", "expert", "auto"]).describe("Target lane; auto re-plans from text"),
    text: tool.schema.string().optional().describe("Challenge text for auto re-plan"),
    hasEvidenceBranch: tool.schema.boolean().optional(),
    reason: tool.schema.string().optional().describe("Why handoff is required"),
  },
  async execute(args, context) {
    const config = await loadPluginConfig(context.directory ?? process.cwd())
    let lane: "fast" | "expert" = args.lane === "fast" || args.lane === "expert" ? args.lane : "expert"

    if (args.lane === "auto") {
      const decision = planRoute(
        {
          text: args.text,
          hasEvidenceBranch: args.hasEvidenceBranch === true,
          mode: "auto",
        },
        config.default_mode,
      )
      lane = primaryAgentForDecision(decision) === "ctf-expert" ? "expert" : "fast"
      if (lane === "expert") {
        throw new Error("Expert handoff must be initiated from the plugin-routed /ctf or /ctf-expert flow so runtime readiness can be verified first.")
      }
      rememberSessionSurface(context.sessionID, lane === "expert" ? "ctf-expert" : "ctf-fast")
      return [
        formatHardRouteHandoff(decision, {
          configDefaultMode: config.default_mode,
          source: "ctf-handoff",
        }),
        "",
        `HANDOFF COMPLETE → behave as **${lane === "expert" ? "ctf-expert" : "ctf-fast"}** from this message on.`,
        args.reason ? `reason: ${args.reason}` : "",
        lane === "expert"
          ? "Load skill ctf-expert. Use Evidence.md + Team Mode. Full tool surface enabled for this session."
          : "Stay on fast allowlist. No Team Mode / Evidence ceremony.",
      ]
        .filter(Boolean)
        .join("\n")
    }

    if (lane === "expert") {
      throw new Error("Expert handoff must be initiated from the plugin-routed /ctf or /ctf-expert flow so runtime readiness can be verified first.")
    }

    rememberSessionSurface(context.sessionID, lane === "expert" ? "ctf-expert" : "ctf-fast")

    if (lane === "expert") {
      return [
        "═══ HANDOFF → ctf-expert (BINDING) ═══",
        args.reason ? `reason: ${args.reason}` : "reason: route/escalation",
        "",
        "From this message on you ARE ctf-expert:",
        "1. Load skill ctf-expert",
        "2. Evidence.md via ctf-evidence-board (3 routes, 4 states, blocked≠dead)",
        "3. Concurrent team workers with routeId=recon|R1|R2|R3",
        "4. Heavy MCP: ctf-mcp-control approve/deny (pending reviewed every synthesize)",
        "5. Flag → return directly and stop",
        "Session tool surface: FULL (fast allowlist no longer applies)",
        "═══════════════════════════════════",
      ].join("\n")
    }

    return [
      "═══ HANDOFF → ctf-fast (BINDING) ═══",
      args.reason ? `reason: ${args.reason}` : "reason: route",
      "",
      "From this message on you ARE ctf-fast:",
      "1. Lightweight tool allowlist only",
      "2. No Team Mode / Evidence ceremony",
      "3. Flag → return directly; else ESCALATE: ctf-expert",
      "═══════════════════════════════════",
    ].join("\n")
  },
})
