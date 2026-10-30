/**
 * Sampling policy: role-split decoding.
 *
 * Explorer agents (category workers, scout, pwn-fast) PROPOSE hypotheses and
 * observations — they need sampling diversity (speculative fan-outs otherwise
 * draw near-identical samples; see roadmap W0). Committer agents (primaries,
 * verifiers, librarian, oracle, retro) decide and verify — they stay
 * near-greedy.
 *
 * Frontmatter values are the source of truth: this hook only fills the
 * role-class default when a value is unset and applies a sanity ceiling.
 * It must never suppress a declared value (the old clamp silently turned
 * ctf-fast's declared top_p 0.7 into 0.1). test/sampling-policy.test.ts pins
 * the frontmatter ↔ hook contract.
 */
const SAMPLING_CEILING = { temperature: 1.2, topP: 1.0 }
const COMMIT_DEFAULT = { temperature: 0.2, topP: 0.1 }
const EXPLORER_DEFAULT = { temperature: 0.8, topP: 0.95 }

/** Agents whose job is proposing diverse hypotheses/observations.
 *
 * ctf-fast is intentionally a committer that keeps a wide nucleus (top_p 0.7):
 * it both proposes and executes, and its declared frontmatter values win.
 */
export const EXPLORER_AGENTS = new Set([
  "ctf-web",
  "ctf-pwn",
  "ctf-rev",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
  "ctf-aisec",
  "ctf-pwn-fast",
  "ctf-scout",
])

export type SamplingClass = "explorer" | "commit"

export function samplingClassForAgent(agent: string): SamplingClass {
  return EXPLORER_AGENTS.has(agent) ? "explorer" : "commit"
}

export async function handleChatParams(args: {
  meta: { agent?: unknown }
  output: { temperature?: number | null; topP?: number | null }
  isHookEnabled: (hook: any) => boolean
  /** Configurable explorer defaults (plugin config explorer_sampling). */
  explorerDefaults?: { temperature: number; top_p: number }
}) {
  if (!args.isHookEnabled("chat_params")) return
  const agent = (typeof args.meta.agent === "string" ? args.meta.agent : "") || ""
  if (!agent.startsWith("ctf-")) return
  const explorer =
    args.explorerDefaults === undefined
      ? EXPLORER_DEFAULT
      : { temperature: args.explorerDefaults.temperature, topP: args.explorerDefaults.top_p }
  const defaults = samplingClassForAgent(agent) === "explorer" ? explorer : COMMIT_DEFAULT
  if (args.output.temperature == null) args.output.temperature = defaults.temperature
  if (args.output.topP == null) args.output.topP = defaults.topP
  args.output.temperature = Math.min(args.output.temperature, SAMPLING_CEILING.temperature)
  args.output.topP = Math.min(args.output.topP, SAMPLING_CEILING.topP)
}

export async function handleSessionCompacting(args: {
  output: { context?: string[] }
  isHookEnabled: (hook: any) => boolean
}) {
  if (!args.isHookEnabled("session_compacting")) return
  if (!args.output.context) args.output.context = []
  args.output.context.push(
    "Preserve Evidence.md content and any known flag format exactly.",
    "Keep the current route plan (R1/R2/R3) and their verification status verbatim.",
    "Retain all verified facts and confirmed dead ends.",
    "If a flag has been partially decoded, keep every character.",
    "Preserve any Docker/pcap/binary analysis state.",
  )
}
