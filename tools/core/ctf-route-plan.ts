import { tool } from "@opencode-ai/plugin"
import { probeFileMagic, probeFileTree } from "../../packages/ctf-core/src/index.ts"
import { loadPluginConfig } from "../../src/plugin-config.ts"
import { formatHardRouteHandoff, planRoute, primaryAgentForDecision } from "../../src/route-runtime.ts"
import { getSessionSurface, persistSessionSurface, rememberSessionSurface } from "../../src/session-surface.ts"
import { directoryFromContext } from "../lib/workspace-path.ts"

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
    fileNames: tool.schema
      .string()
      .optional()
      .describe(
        'JSON array of challenge file names (e.g. ["chall.elf","flag.enc"]). Probed for family signals — use when there is no challenge text.',
      ),
    fileMagics: tool.schema
      .string()
      .optional()
      .describe(
        'JSON array of {"name","hex"} magic-byte headers, e.g. [{"name":"a.bin","hex":"7f454c46"}]. Probed for ELF/PE/ZIP/PCAP/PNG/etc.',
      ),
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
    const startDir = directoryFromContext(context)
    const sessionID = context?.sessionID
    const config = await loadPluginConfig(startDir)

    // File probes: cheap attachment evidence for challenge text-less routing.
    let fileProbeSignals: string[] = []
    let fileProbeCount = 0
    try {
      const names = args.fileNames ? (JSON.parse(args.fileNames) as unknown) : []
      const magics = args.fileMagics ? (JSON.parse(args.fileMagics) as unknown) : []
      const nameSignals = Array.isArray(names) ? probeFileTree(names.map(String)) : []
      const magicSignals = Array.isArray(magics) ? probeFileMagic(magics as Array<{ name: string; hex: string }>) : []
      fileProbeSignals = [...new Set([...nameSignals, ...magicSignals])]
      fileProbeCount = (Array.isArray(names) ? names.length : 0) + (Array.isArray(magics) ? magics.length : 0)
    } catch {
      // Invalid JSON in probe args is a routing-input error, not a crash.
    }

    const userSignals = (args.signals ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const decision = planRoute(
      {
        text: args.text,
        signals: [...new Set([...userSignals, ...fileProbeSignals])],
        hasEvidenceBranch: args.hasEvidenceBranch === true,
        mode: args.mode ?? "auto",
      },
      config.default_mode,
    )
    const primary = primaryAgentForDecision(decision)
    const isWorker = typeof context?.agent === "string" && context.agent.startsWith("ctf-") && context.agent !== "ctf-expert" && context.agent !== "ctf-fast"
    if (primary === "ctf-expert" && !isWorker && sessionID && getSessionSurface(sessionID) !== "ctf-expert") {
      throw new Error("Expert route planning requires an explicitly promoted ctf-expert session surface.")
    }
    if (!isWorker) {
      rememberSessionSurface(sessionID, primary)
      void persistSessionSurface(
        context?.worktree ?? context?.directory ?? process.cwd(),
        sessionID,
        primary,
        primary === "ctf-expert" ? "route" : "explicit-fast",
      ).catch((err) => console.warn("[ctf-route-plan] session-surface persist (non-fatal):", err))
    }

    return [
      formatHardRouteHandoff(decision, {
        configDefaultMode: config.default_mode,
        source: "ctf-route-plan",
      }),
      "",
      fileProbeCount > 0
        ? `file_probe: ${fileProbeCount} attachment(s) scanned -> signals=${fileProbeSignals.join(", ") || "(none)"}`
        : "",
      "JSON:",
      JSON.stringify(
        {
          ...decision,
          primary_session_agent: primary,
          config_default_mode: config.default_mode,
          file_probe_count: fileProbeCount,
          file_probe_signals: fileProbeSignals,
        },
        null,
        2,
      ),
    ]
      .filter(Boolean)
      .join("\n")
  },
})
