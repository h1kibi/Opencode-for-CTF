import { buildCtfEntryInjection } from "../route-runtime.ts"
import { loadContinuationState } from "../continuation-manager.ts"
import type { PluginUserConfig } from "../plugin-config.ts"
import { propString } from "../plugin-support.ts"

function firstNonEmptyString(...values: string[]) {
  return values.find((value) => value !== "") ?? ""
}

export async function handleCommandExecuteBefore(args: {
  meta: Record<string, unknown>
  output: Record<string, any>
  pluginConfig: PluginUserConfig
  worktree: string
  directory: string
  expertReadinessReport: () => { ready: boolean }
  expertReadinessFailureText: (userText?: string, sessionNote?: string) => string
  requireExpertReadiness: (userText?: string, sessionNote?: string) => void
  promoteExpertSurface: (sessionID?: string | null) => void
  promoteFastSurface: (sessionID?: string | null) => void
}) {
  const cmd = typeof args.meta.command === "string" ? args.meta.command : ""

  if (cmd === "ctf" || cmd === "ctf-solve") {
    args.output.parts = args.output.parts || []
    const userText = firstNonEmptyString(
      propString(args.meta, "arguments"),
      propString(args.meta, "args"),
      propString(args.meta, "text"),
      propString(args.output, "text"),
    )
    const hasEvidence = /\bwork[\\/]+ctf-evidence\b/i.test(userText) || /\bEvidence\.md\b/i.test(userText)
    let injection: string
    let primary: "ctf-fast" | "ctf-expert" = "ctf-fast"
    try {
      const planned = buildCtfEntryInjection({
        userText: userText || "(no challenge text yet — route after first triage)",
        config: args.pluginConfig,
        hasEvidenceBranch: hasEvidence,
      })
      injection = planned.text
      primary = planned.primary
    } catch (err) {
      injection = `🔴 CTF SOLVE MODE — Call ctf-route-plan first. (route inject failed: ${
        err instanceof Error ? err.message : String(err)
      })`
      if (args.pluginConfig.default_mode === "expert" || hasEvidence) primary = "ctf-expert"
    }
    if (args.pluginConfig.default_mode === "expert") {
      injection +=
        "\n\n⚙️ config default_mode=expert — prefer ctf-expert workflow unless route is clearly trivial fast."
    } else if (args.pluginConfig.default_mode === "fast") {
      injection += "\n\n⚙️ config default_mode=fast — stay on ctf-fast unless signals force expert/resume."
    }
    if (primary === "ctf-expert") {
      args.requireExpertReadiness(userText, "/ctf routed to ctf-expert")
      try {
        ;(args.output as { agent?: string }).agent = "ctf-expert"
      } catch {
        // harness may ignore
      }
      args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined)
      injection += [
        "",
        "",
        "⚠️ COMMAND AGENT MAY STILL BE LABELLED ctf-fast — IGNORE THAT LABEL.",
        "If available, call tool `ctf-handoff` with lane=expert; otherwise follow the expert contract without delay.",
        "Authoritative contract: commands/ctf-expert.md + skill `ctf-expert` — do not use the ctf-fast intuition-only workflow.",
      ].join("\n")
    }
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: injection,
    })
    return
  }

  if (cmd === "resume") {
    const userText = firstNonEmptyString(
      propString(args.meta, "arguments"),
      propString(args.meta, "args"),
      propString(args.meta, "text"),
      propString(args.output, "text"),
    )
    const readied = args.expertReadinessReport()
    if (!readied.ready) {
      throw new Error(args.expertReadinessFailureText(userText, "command agent via /resume"))
    }
    args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined)
    args.output.parts = args.output.parts || []
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: `🔁 CTF RESUME MODE — Expert runtime preflight passed.
- Authoritative contract: commands/resume.md + skill \`ctf-expert\`.
- Resume from existing work/ctf-evidence state; do not restart broad recon by default.`,
    })
    return
  }

  if (cmd === "ctf-expert") {
    const userText = firstNonEmptyString(
      propString(args.meta, "arguments"),
      propString(args.meta, "args"),
      propString(args.meta, "text"),
      propString(args.output, "text"),
    )
    const readied = args.expertReadinessReport()
    if (!readied.ready) {
      throw new Error(args.expertReadinessFailureText(userText, "command agent via /ctf-expert"))
    }
    let fastBudgetHandoff = ""
    try {
      const contState = await loadContinuationState(
        args.worktree,
        typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
        args.directory,
      )
      if (contState.fastBudgetStatus === "escalated" && contState.fastBudgetSummary) {
        fastBudgetHandoff = `\n\n🔁 FAST BUDGET HANDOFF — resume from saved fast-lane state:\n${contState.fastBudgetSummary}`
      }
    } catch {
      // non-fatal
    }
    args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined)
    args.output.parts = args.output.parts || []
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: `🔴 CTF EXPERT MODE — Binding contract:
- Authoritative contract: commands/ctf-expert.md + skill \`ctf-expert\` (load it).
- Runtime gates enforce: Evidence.md via ctf-evidence-board (exactly 3 routes; blocked≠dead), Phase ② local-recall order, Team Mode orchestration, heavy-MCP approval via ctf-mcp-control.
- Flag → return directly and stop active exploitation (no mandatory flag file); mention manual researcher post-solve maintenance with the evidence path, but do not dispatch or await it.
- Optional: ctf-route-plan mode=expert for category hints.${fastBudgetHandoff}`,
    })
    return
  }

  if (cmd === "ctf-fast") {
    args.promoteFastSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined)
    args.output.parts = args.output.parts || []
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: `🔴 CTF FAST MODE — Lightweight allowlist only (runtime-enforced).
- Authoritative contract: commands/ctf-fast.md.
- No Team Mode, no Evidence.md ceremony, no expert-only tools.
- Shortest path to flag; on collapse output ESCALATE: ctf-expert with clues.`,
    })
  }
}
