import { tool } from "@opencode-ai/plugin"
import { loadPluginConfig } from "../src/plugin-config.ts"
import { formatHardRouteHandoff, planRoute, primaryAgentForDecision } from "../src/route-runtime.ts"
import { rememberSessionSurface } from "../src/session-surface.ts"

/**
 * Cheap category + mode router for the default /ctf pipeline.
 * Honors opencode-for-ctf.jsonc `default_mode` when mode is omitted/auto.
 */
export default tool({
  description:
    "Plan the CTF solve route from challenge text/signals. Returns BINDING mode (fast|expert|resume), agent, skills, tool packs, and confidence. Uses plugin default_mode when mode=auto. Call at the start of /ctf.",
  args: {
    text: tool.schema.string().optional().describe("Challenge description, path, URL, or notes"),
    signals: tool.schema
      .string()
      .optional()
      .describe("Comma- or newline-separated signal tags from triage (e.g. elf,http,pcap)"),
    hasEvidenceBranch: tool.schema
      .boolean()
      .optional()
      .describe("True when work/ctf-evidence/<slug>/ already has useful state"),
    mode: tool.schema
      .enum(["auto", "fast", "expert"])
      .optional()
      .describe("Force solve intensity; default auto (then plugin default_mode)"),
  },
  async execute(args, context) {
    const startDir = context.directory ?? process.cwd()
    const config = await loadPluginConfig(startDir)
    const decision = planRoute(
      {
        text: args.text,
        signals: args.signals,
        hasEvidenceBranch: args.hasEvidenceBranch === true,
        mode: args.mode ?? "auto",
      },
      config.default_mode,
    )
    const primary = primaryAgentForDecision(decision)
    rememberSessionSurface(context.sessionID, primary)

    return [
      formatHardRouteHandoff(decision, {
        configDefaultMode: config.default_mode,
        source: "ctf-route-plan",
      }),
      "",
      "JSON:",
      JSON.stringify(
        {
          ...decision,
          primary_session_agent: primary,
          config_default_mode: config.default_mode,
        },
        null,
        2,
      ),
    ].join("\n")
  },
})
