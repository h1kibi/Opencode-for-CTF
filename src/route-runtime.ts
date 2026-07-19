/**
 * Runtime routing helpers for /ctf hard handoff and ctf-route-plan.
 * Pure decision stays in ctf-core; this layer applies plugin config defaults.
 */

import {
  decideRoute,
  formatRouteDecision,
  type RouteDecision,
  type RouteInput,
  type SolveMode,
} from "../packages/ctf-core/src/router.ts"
import type { PluginUserConfig } from "./plugin-config.ts"

export type RoutePlanArgs = {
  text?: string
  signals?: string[] | string
  hasEvidenceBranch?: boolean
  /** Explicit mode from tool/user; wins over config when not auto/empty. */
  mode?: SolveMode | string
}

function parseSignals(signals?: string[] | string): string[] | undefined {
  if (!signals) return undefined
  if (Array.isArray(signals)) return signals.map((s) => String(s).trim()).filter(Boolean)
  return signals
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Resolve effective SolveMode:
 * 1. explicit mode if fast|expert|resume-ish
 * 2. else plugin default_mode if not auto
 * 3. else auto
 */
export function resolveSolveMode(
  requested: string | undefined,
  configDefault: PluginUserConfig["default_mode"] | undefined,
): SolveMode {
  const r = (requested ?? "").trim().toLowerCase()
  if (r === "fast" || r === "expert") return r
  // "auto" or empty → fall through to config
  const d = (configDefault ?? "auto").trim().toLowerCase()
  if (d === "fast" || d === "expert") return d
  return "auto"
}

export function planRoute(
  args: RoutePlanArgs,
  configDefault: PluginUserConfig["default_mode"] = "auto",
): RouteDecision {
  const mode = resolveSolveMode(args.mode, configDefault)
  const input: RouteInput = {
    text: args.text,
    signals: parseSignals(args.signals),
    hasEvidenceBranch: args.hasEvidenceBranch === true,
    mode,
  }
  return decideRoute(input)
}

/** Primary agent the session should behave as after routing. */
export function primaryAgentForDecision(decision: RouteDecision): "ctf-fast" | "ctf-expert" {
  return decision.mode === "fast" ? "ctf-fast" : "ctf-expert"
}

/**
 * Hard handoff block injected into /ctf (and shown by ctf-route-plan).
 * Models are instructed to treat this as binding, not advisory.
 */
export function formatHardRouteHandoff(
  decision: RouteDecision,
  opts?: { configDefaultMode?: string; source?: string },
): string {
  const primary = primaryAgentForDecision(decision)
  const lines = [
    "═══ CTF ROUTE DECISION (BINDING) ═══",
    formatRouteDecision(decision),
    "",
    `primary_session_agent: ${primary}`,
    opts?.configDefaultMode ? `config_default_mode: ${opts.configDefaultMode}` : "",
    opts?.source ? `route_source: ${opts.source}` : "",
    "",
    "MANDATORY next steps:",
  ].filter(Boolean)

  if (decision.mode === "resume") {
    lines.push(
      "1. Behave as **ctf-expert** (resume). Load skills: " + decision.skills.join(", "),
      "2. Open existing Evidence.md / work/ctf-evidence branch — do NOT re-triage from zero.",
      "3. `ctf-evidence-board command=summary` then continue verify/iterate.",
      "4. Flag → return directly and stop.",
    )
  } else if (primary === "ctf-expert" || decision.mode === "expert") {
    lines.push(
      "1. Behave as **ctf-expert**. Load skill `ctf-expert` first, then: " + decision.skills.join(", "),
      "2. `ctf-evidence-board command=init` (Evidence.md) if not resuming.",
      "3. Phase loop: recon (concurrent) → set-routes (exactly 3) → verify → flag direct return.",
      "4. Route states: untested | blocked | dead | live — blocked ≠ dead.",
      "5. Heavy MCP: workers request via ctf-dynamic-mcp-advisor; you approve via ctf-mcp-control.",
      "6. Do not stay in ctf-fast workflow. Do not skip Evidence.md.",
    )
  } else {
    lines.push(
      "1. Behave as **ctf-fast** (lightweight allowlist only).",
      "2. Load skills: " + decision.skills.join(", "),
      decision.category
        ? `3. Prefer category angle: **${decision.category}** (still on fast tools; no Team Mode).`
        : "3. Cheap triage then shortest path to flag.",
      "4. If 6–8 meaningful actions fail or challenge is source-rich/multi-service/heap/kernel → output `ESCALATE: ctf-expert` with clue summary.",
      "5. Flag → return directly and stop. No Evidence.md ceremony.",
    )
  }

  lines.push(
    "",
    "This decision is binding for this turn. Do not invent a third mode.",
    "═══════════════════════════════════",
  )
  return lines.join("\n")
}

/** Text injected when /ctf runs, before the model acts. */
export function buildCtfEntryInjection(args: {
  userText: string
  config: PluginUserConfig
  hasEvidenceBranch?: boolean
}): { text: string; decision: RouteDecision; primary: "ctf-fast" | "ctf-expert" } {
  const decision = planRoute(
    {
      text: args.userText,
      hasEvidenceBranch: args.hasEvidenceBranch,
      mode: "auto",
    },
    args.config.default_mode,
  )
  const primary = primaryAgentForDecision(decision)
  const handoff = formatHardRouteHandoff(decision, {
    configDefaultMode: args.config.default_mode,
    source: "/ctf command.execute.before",
  })
  const text = [
    "🔴 CTF SOLVE MODE — Drive to flag, exhausted routes, or a required user resource.",
    "",
    handoff,
    "",
    "If you have not called `ctf-route-plan` yet, you may call it to refresh signals,",
    "but you must still obey the binding decision above unless new evidence clearly flips mode.",
    "Report only on: flag found | all routes confirmed dead | need user resource | ESCALATE: ctf-expert.",
  ].join("\n")
  return { text, decision, primary }
}
