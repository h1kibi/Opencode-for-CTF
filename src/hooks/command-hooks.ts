import { buildCtfEntryInjection } from "../route-runtime.ts"
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
  promoteExpertSurface: (sessionID?: string | null, source?: "explicit" | "route") => void
  promoteFastSurface: (sessionID?: string | null, source?: "explicit-fast") => void
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
      args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined, "route")
      injection += [
        "",
        "",
        "⚠️ COMMAND AGENT MAY STILL BE LABELLED ctf-fast — IGNORE THAT LABEL.",
        "Follow the expert contract immediately — the runtime already switched this session's tool surface.",
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
    args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined, "explicit")
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
    args.promoteExpertSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined, "explicit")
    args.output.parts = args.output.parts || []
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: `🔴 CTF EXPERT MODE — Binding contract:
- Authoritative contract: commands/ctf-expert.md + skill \`ctf-expert\` (load it).
- Runtime gates enforce: Evidence.md via ctf-evidence-board (exactly 3 routes; blocked≠dead), Team Mode orchestration, and heavy-MCP approval via ctf-mcp-control.
- The Phase ② local-recall order (lessons → retros → pattern cards) is a contract you must follow; it is not runtime-enforced.
- Flag → return directly and stop active exploitation (no mandatory flag file); mention manual researcher post-solve maintenance with the evidence path, but do not dispatch or await it.
- Independent lane: the ctf-fast and ctf-expert lanes never switch automatically.
- Optional: ctf-route-plan mode=expert for category hints.`,
    })
    return
  }

  if (cmd === "ctf-fast") {
    args.promoteFastSurface(typeof args.meta.sessionID === "string" ? args.meta.sessionID : undefined, "explicit-fast")
    args.output.parts = args.output.parts || []
    args.output.parts.push({
      id: "",
      sessionID: typeof args.meta.sessionID === "string" ? args.meta.sessionID : "",
      messageID: "",
      type: "text",
      text: `🔴 CTF FAST MODE — Lightweight allowlist only (runtime-enforced).
- Authoritative contract: commands/ctf-fast.md.
- No Team Mode, no Evidence.md ceremony, no expert-only tools.
- Independent lane: stay on ctf-fast as long as you want; it never switches automatically.
- Shortest path to flag; when the challenge exceeds this lane, report the blocker, strongest evidence, and best next direction, then stop.`,
    })
  }
}
