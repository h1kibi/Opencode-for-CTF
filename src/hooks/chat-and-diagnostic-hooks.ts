export async function handleChatParams(args: {
  meta: { agent?: unknown }
  output: { temperature?: number | null; topP?: number | null }
  isHookEnabled: (hook: any) => boolean
}) {
  if (!args.isHookEnabled("chat_params")) return
  const agent = (typeof args.meta.agent === "string" ? args.meta.agent : "") || ""
  if (!agent.startsWith("ctf-")) return
  // Deterministic solving needs low temperature. The per-agent frontmatter
  // already sets temperature 0/0.3; this is a runtime safety net that also
  // clamps topP and covers agents without a frontmatter value. Both layers
  // deliberately agree — change them together.
  if (args.output.temperature == null || args.output.temperature > 0.5) {
    args.output.temperature = 0.2
  }
  if (args.output.topP == null || args.output.topP > 0.5) {
    args.output.topP = 0.1
  }
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
