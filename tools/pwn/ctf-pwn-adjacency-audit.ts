import { tool } from "@opencode-ai/plugin"

type AuditRow = {
  target: string
  previous: string
  next: string
  consumer: string
  outputHijack: string
  shorter: string
  confidence: number
  note: string
}

function lines(text: string) {
  return text.split(/\r?\n/)
}

function has(text: string, re: RegExp) {
  return re.test(text)
}

function score(row: AuditRow) {
  let s = row.confidence
  if (/yes/i.test(row.outputHijack)) s += 2
  if (/yes/i.test(row.shorter)) s += 2
  if (/printf|puts|write|send/i.test(row.consumer)) s += 2
  if (/path|length|state|string|format/i.test(row.note)) s += 1
  return s
}

export default tool({
  description:
    "CTF pwn adjacency audit: analyze writable long-lived memory evidence and rank adjacent-object or output-hijack closure opportunities before ROP/file-write drift.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Source, decompilation, disassembly notes, symbol notes, globals, nearby strings, or behavior clues involving writable global/.bss/heap/parser buffers and later consumers.",
      ),
  },
  async execute(args) {
    const raw = String(args.evidence || "")
    const lower = raw.toLowerCase()
    if (raw.trim().length < 20)
      return "BLOCK: provide decompilation, source, or notes showing writable memory plus nearby consumers"

    const writable = has(
      lower,
      /\.bss|global|writable|heap state|parser buffer|long-lived|scanf|fgets|read\(|recv\(|strcpy|memcpy/,
    )
    const outputConsumer = has(lower, /puts|printf|write\(|send\(|fprintf|snprintf|dprintf/)
    const pathConsumer = has(lower, /open\(|fopen\(|path|filename|flag path|user\.log|\/flag/)
    const branchConsumer = has(lower, /if\s*\(|cmp|compare|strcmp|strncmp|state|flag byte|length|counter|bool|branch/)
    const partialSecret = has(
      lower,
      /partial flag|prefix of flag|almost prints|prints secret|near-secret|stops at|encountered \{/,
    )

    const out: AuditRow[] = []

    if (writable && outputConsumer) {
      out.push({
        target: "writable long-lived buffer",
        previous: "unknown from evidence",
        next: "adjacent strings / state / path / format / output buffer",
        consumer: "existing output consumer present",
        outputHijack: "yes",
        shorter: partialSecret ? "yes" : "unknown",
        confidence: partialSecret ? 5 : 4,
        note: partialSecret
          ? "program already emits secret-bearing bytes; prioritize output extension/hijack over new shell path"
          : "output consumer exists after writable state; test nearby string, format, path, or length corruption first",
      })
    }

    if (writable && pathConsumer) {
      out.push({
        target: "writable long-lived buffer",
        previous: "unknown from evidence",
        next: "path / filename / opened object",
        consumer: "path or file open consumer present",
        outputHijack: outputConsumer ? "yes" : "unknown",
        shorter: "unknown",
        confidence: 4,
        note: "test path overwrite, opened-object redirection, or read target rewrite before broader file-write closure assumptions",
      })
    }

    if (writable && branchConsumer) {
      out.push({
        target: "writable long-lived buffer",
        previous: "unknown from evidence",
        next: "state / compare / length / branch field",
        consumer: "later branch or compare uses nearby data",
        outputHijack: outputConsumer ? "unknown" : "no",
        shorter: "unknown",
        confidence: 3,
        note: "test state-byte, length, boolean, counter, or compare corruption that unlocks a closer secret/output path",
      })
    }

    const nearLines = lines(raw)
      .filter((l) =>
        /adjacent|neighbor|previous|next|global|bss|printf|puts|write|open|fopen|flag|path|length|state|format/i.test(
          l,
        ),
      )
      .slice(0, 12)

    if (!out.length) {
      out.push({
        target: "unknown writable object",
        previous: "unknown",
        next: "unknown",
        consumer: "insufficient evidence",
        outputHijack: "unknown",
        shorter: "unknown",
        confidence: 1,
        note: "need explicit writable object, adjacent objects, and later consumers before ranking adjacency routes",
      })
    }

    out.sort((a, b) => score(b) - score(a))

    const strongest = out[0]
    const decision =
      /yes/i.test(strongest.outputHijack) || /yes/i.test(strongest.shorter)
        ? "prefer_adjacency_first"
        : out.length > 1
          ? "keep_as_orthogonal_closure_hypothesis"
          : "insufficient_adjacency_evidence"

    return [
      "pwn_adjacency_audit:",
      `writable_signal: ${writable}`,
      `output_consumer_signal: ${outputConsumer}`,
      `path_consumer_signal: ${pathConsumer}`,
      `branch_consumer_signal: ${branchConsumer}`,
      `partial_secret_signal: ${partialSecret}`,
      `recommended_decision: ${decision}`,
      "top_candidates:",
      ...out
        .slice(0, 4)
        .flatMap((r, i) => [
          `- #${i + 1} target=${r.target}`,
          `  previous_adjacent: ${r.previous}`,
          `  next_adjacent: ${r.next}`,
          `  consumer: ${r.consumer}`,
          `  existing_output_hijack: ${r.outputHijack}`,
          `  shorter_than_shell_rop_filewrite: ${r.shorter}`,
          `  confidence: ${r.confidence}`,
          `  note: ${r.note}`,
        ]),
      "nearby_evidence_lines:",
      ...nearLines.map((l) => `- ${l.trim()}`),
      "next_probe_contract:",
      "- Choose one adjacency hypothesis only: output-string overwrite, path overwrite, length/state overwrite, or nearby format/consumer corruption.",
      "- Confirm with one behavioral differential before returning to shell/ROP/file-write expansion.",
      "- If two adjacency probes are flat, demote adjacency but keep it recorded as tested.",
    ].join("\n")
  },
})
