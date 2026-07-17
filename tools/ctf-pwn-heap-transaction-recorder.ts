import { tool } from "@opencode-ai/plugin"

type StepKind = "alloc" | "free" | "edit" | "show" | "consume" | "buy" | "sell" | "use" | "remove" | "unknown"

type Step = {
  line: string
  kind: StepKind
  sizeClass?: string
  pointer?: string
  objectHint?: string
  staleHint?: boolean
}

function lines(text: string) {
  return text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function firstMatch(line: string, re: RegExp) {
  const m = line.match(re)
  return m?.[1]
}

function classifyStep(line: string): Step {
  const lower = line.toLowerCase()
  let kind: StepKind = "unknown"
  if (/\b(malloc|alloc|create|new)\b/.test(lower)) kind = "alloc"
  else if (/\b(free|delete|destroy|drop)\b/.test(lower)) kind = "free"
  else if (/\b(edit|write|update|rename|set name|new name)\b/.test(lower)) kind = "edit"
  else if (/\b(show|display|print|view|read)\b/.test(lower)) kind = "show"
  else if (/\bconsume\b/.test(lower)) kind = "consume"
  else if (/\bbuy\b/.test(lower)) kind = "buy"
  else if (/\bsell\b/.test(lower)) kind = "sell"
  else if (/\buse\b/.test(lower)) kind = "use"
  else if (/\bremove\b/.test(lower)) kind = "remove"

  const sizeHex = firstMatch(line, /(?:size|chunk|bin|tcache|malloc)\s*[:=]?\s*(0x[0-9a-fA-F]+)/)
  const sizeDec = firstMatch(line, /(?:size|chunk)\s*[:=]?\s*(\d{2,5})\b/)
  const pointer = firstMatch(line, /(0x[0-9a-fA-F]{5,16})/)
  const objectHint = firstMatch(
    line,
    /\b(ring|bomb|sword|shield|item|name|description|skill|accessory|inventory|equipment|object|wrapper)\b/i,
  )
  const staleHint = /stale|uaf|use-after-free|post-free|after free|dangling/i.test(lower)

  return {
    line,
    kind,
    sizeClass: sizeHex || sizeDec,
    pointer,
    objectHint,
    staleHint,
  }
}

function summarizeKinds(steps: Step[]) {
  const counts = new Map<StepKind, number>()
  for (const step of steps) counts.set(step.kind, (counts.get(step.kind) || 0) + 1)
  return counts
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

export default tool({
  description:
    "CTF pwn heap transaction recorder: reduce menu/game/inventory notes into allocator lifecycle, likely size-class/refill facts, stale-reference clues, and the next heap reduction probes.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Menu transcripts, notes, source snippets, debugger notes, or malloc/free log lines describing a heap/UAF branch.",
      ),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    if (text.trim().length < 20)
      return "BLOCK: provide menu transcripts, notes, source snippets, or allocator log lines"

    const steps = lines(text).slice(0, 120).map(classifyStep)
    const counts = summarizeKinds(steps)
    const allocLike = (counts.get("alloc") || 0) + (counts.get("buy") || 0)
    const freeLike =
      (counts.get("free") || 0) + (counts.get("sell") || 0) + (counts.get("consume") || 0) + (counts.get("remove") || 0)
    const editLike = counts.get("edit") || 0
    const showLike = counts.get("show") || 0

    const sizeClasses = unique(steps.map((s) => s.sizeClass).filter(Boolean) as string[])
    const pointers = unique(steps.map((s) => s.pointer).filter(Boolean) as string[])
    const objectHints = unique(steps.map((s) => s.objectHint).filter(Boolean) as string[])
    const staleSteps = steps.filter((s) => s.staleHint)

    const highSignals: string[] = []
    if (allocLike > 0 && freeLike > 0) highSignals.push("allocator_lifecycle_present")
    if (showLike > 0) highSignals.push("readback_consumer_present")
    if (editLike > 0) highSignals.push("mutable_field_present")
    if (staleSteps.length > 0) highSignals.push("stale_reference_signal_present")
    if (sizeClasses.length > 0) highSignals.push("size_class_hints_present")
    if (pointers.length > 0) highSignals.push("pointer_or_leak_hints_present")

    const likelyStaleOwners = steps
      .filter(
        (s) =>
          s.staleHint ||
          (s.kind === "show" && /description|name|item|skill|accessory|inventory|equipment/i.test(s.line)),
      )
      .map((s) => `${s.objectHint || "object"} via ${s.kind}`)
    const refillCandidates = objectHints.map((h) => `re-buy or recreate ${h} with same size class to test refill`)

    const nextProbes: string[] = []
    if (allocLike > 0 && freeLike > 0)
      nextProbes.push(
        "Write a chunk lifecycle table and mark which action allocates, which frees, and which consumer still reads afterwards.",
      )
    if (sizeClasses.length) nextProbes.push(`Focus on same-size refill testing for: ${sizeClasses.join(", ")}.`)
    else
      nextProbes.push(
        "Confirm one likely size class from source, allocator log, or object field lengths before naming a heap technique.",
      )
    if (pointers.length)
      nextProbes.push(
        "Classify the first pointer-shaped leak with ctf-pwn-heap-leak-classifier before final heap/libc math.",
      )
    else
      nextProbes.push(
        "Try one leak-oriented readback after a free/rebuy sequence to determine whether freed chunk contents are exposed.",
      )
    if (editLike > 0)
      nextProbes.push(
        "Check whether edit/rename/new-name crosses an object-field boundary and whether that pivot yields AAR or AAW.",
      )

    return [
      "pwn_heap_transaction_recorder:",
      `steps_seen: ${steps.length}`,
      `alloc_like: ${allocLike}`,
      `free_like: ${freeLike}`,
      `edit_like: ${editLike}`,
      `show_like: ${showLike}`,
      `size_classes_seen: ${sizeClasses.join(", ") || "none"}`,
      `object_hints: ${objectHints.join(", ") || "none"}`,
      "high_value_signals:",
      ...(highSignals.length ? highSignals.map((s) => `- ${s}`) : ["- none strong; gather more lifecycle notes"]),
      "transaction_table:",
      ...steps
        .slice(0, 24)
        .map(
          (s, idx) =>
            `- step ${idx + 1}: kind=${s.kind} size=${s.sizeClass || "?"} ptr=${s.pointer || ""} object=${s.objectHint || ""} stale=${s.staleHint ? "yes" : "no"} line=${s.line}`,
        ),
      "likely_stale_owners:",
      ...(likelyStaleOwners.length
        ? likelyStaleOwners.map((s) => `- ${s}`)
        : ["- none explicit; identify which show/display path still touches a freed field"]),
      "refill_candidates:",
      ...(refillCandidates.length
        ? refillCandidates.map((s) => `- ${s}`)
        : ["- identify one object type that can be recreated to occupy the same size class"]),
      "next_reduction_probes:",
      ...nextProbes.map((s) => `- ${s}`),
      "stop_rule:",
      "- If two more high-level actions do not improve allocation/free/reuse knowledge, stop consumer probing and switch to lifecycle, size-class, or field-offset confirmation.",
    ].join("\n")
  },
})
