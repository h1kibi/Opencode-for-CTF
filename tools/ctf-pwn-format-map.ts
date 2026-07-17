import { tool } from "@opencode-ai/plugin"

function has(text: string, re: RegExp) {
  return re.test(text)
}

function collectHints(text: string) {
  const lower = text.toLowerCase()
  const hints: string[] = []
  if (/%\d*\$p|%p/.test(text) || /format/.test(lower)) hints.push("stack_leak_probe")
  if (/%\d*\$s|%s/.test(text)) hints.push("pointer_dereference_read_candidate")
  if (/%\d*\$n|%n/.test(text)) hints.push("write_capability_candidate")
  if (/canary/.test(lower)) hints.push("canary_leak_route")
  if (/pie|base/.test(lower)) hints.push("pie_or_binary_base_route")
  if (/libc|puts|__libc_start_main|got|plt/.test(lower)) hints.push("libc_leak_route")
  return hints.length ? hints : ["read_only_offset_map_first"]
}

export default tool({
  description:
    "CTF pwn format map: summarize a read-first format-string workflow, likely leak classes, and write gating before %n attempts.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Observed format-string output, source notes, binary probe clues, or notes about %p/%s/%n behavior."),
  },
  async execute(args) {
    const text = args.evidence || ""
    if (text.trim().length < 10) return "BLOCK: provide format-string evidence or notes"

    const positional = has(text, /%\d+\$/)
    const leakHints = [
      has(text, /canary/i) ? "canary_candidate" : "",
      has(text, /libc|puts|__libc_start_main|got|plt/i) ? "libc_candidate" : "",
      has(text, /pie|binary base|code pointer/i) ? "pie_candidate" : "",
      has(text, /stack|rbp|rsp|saved rip|saved eip/i) ? "stack_candidate" : "",
      has(text, /heap/i) ? "heap_candidate" : "",
    ].filter(Boolean)
    const writeGates = [
      positional ? "positional_write_possible_if_offset_stable" : "confirm_positional_behavior_first",
      has(text, /full relro/i) ? "full_relro_blocks_got_overwrite" : "relro_state_still_needed",
      has(text, /%n/i) ? "n_specifier_seen_but_writability_unproven" : "n_specifier_not_yet_observed",
      has(text, /null|truncation/i) ? "null_truncation_risk" : "",
    ].filter(Boolean)

    const firstSteps = [
      "Build a read-only offset map with harmless positional markers before any write attempt.",
      "Classify each stable leak as stack, libc, PIE, heap, or unknown before computing any base.",
      "Confirm whether positional specifiers work and whether the stack drifts between runs.",
      "Determine RELRO and writable targets before planning %n writes.",
      "If only readback is stable, prefer leak-to-primitive closure over premature write attempts.",
    ]

    const hints = collectHints(text)

    return [
      "pwn_format_map:",
      `positional_behavior_clue: ${positional}`,
      "leak_class_candidates:",
      ...(leakHints.length ? leakHints.map((x) => `- ${x}`) : ["- classify from the first stable read-only map"]),
      "write_gates:",
      ...writeGates.map((x) => `- ${x}`),
      "route_hints:",
      ...hints.map((x) => `- ${x}`),
      "first_steps:",
      ...firstSteps.map((x) => `- ${x}`),
      "stop_rule:",
      "- Do not attempt %n writes until offset, target class, write size, RELRO state, and output stability are known.",
    ].join("\n")
  },
})
