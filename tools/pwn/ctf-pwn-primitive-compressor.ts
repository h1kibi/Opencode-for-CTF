import { tool } from "@opencode-ai/plugin"

function uniq<T>(xs: T[]) {
  return Array.from(new Set(xs))
}

function extractFrameOffset(text: string) {
  const m = text.match(/\[rbp\s*-\s*0x([0-9a-f]+)\]/i)
  return m ? parseInt(m[1], 16) : 0
}

function extractCallsites(text: string) {
  const lines = text.split(/\r?\n/)
  const out: Array<{ address: string; callee: string; line: string }> = []
  for (const line of lines) {
    const m = line.match(/\b([0-9a-f]{6,16})[:\s].*call\s+.*(?:<([^>]+)>|(printf|puts|write|system|open|read))/i)
    if (m) out.push({ address: `0x${m[1]}`, callee: m[2] || m[3] || "call", line: line.trim() })
  }
  return out.slice(0, 12)
}

function extractGotTargets(text: string) {
  const names = ["printf", "puts", "read", "write", "__libc_start_main", "system"]
  const targets = [] as string[]
  for (const n of names)
    if (new RegExp(`${n}.*(?:@got|got|plt)|(?:@got|got).*${n}`, "i").test(text)) targets.push(`${n}@got`)
  return uniq(targets)
}

export default tool({
  description:
    "CTF PWN primitive compressor: convert high-value disassembly/control signals into a prioritized minimal one-variable primitive probe with oracle/falsifier.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Disassembly/decompilation/notes with callsites, rbp control, GOT/global targets, and offset/control evidence.",
      ),
    controlOffset: tool.schema.string().optional().describe("Known padding to saved rbp, e.g. 0x30 or 48."),
    callsite: tool.schema.string().optional().describe("Known reentry/callsite address override."),
    target: tool.schema.string().optional().describe("Known target override such as printf@got or 0x404020."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const evidence = String(args.evidence || "")
    if (evidence.trim().length < 16) return "BLOCK: provide disassembly/control evidence"
    const lower = evidence.toLowerCase()
    const k = extractFrameOffset(evidence)
    const callsites = extractCallsites(evidence)
    const gotTargets = extractGotTargets(evidence)
    const frameArg =
      /lea\s+r(ax|di|si|dx|cx|8|9),\s*\[rbp\s*-\s*0x[0-9a-f]+\]/i.test(evidence) ||
      /mov\s+rdi,\s*\[rbp\s*-\s*0x[0-9a-f]+\]/i.test(evidence)
    const savedRbp = /saved rbp|rbp control|overwrite rbp|leave\s*;?\s*ret|\bleave\b|payload.*p64\([^)]*rbp/i.test(
      lower,
    )
    const printCall = /printf|puts|write/.test(lower)
    const candidates: any[] = []
    if (frameArg && printCall) {
      const callsite =
        args.callsite ||
        callsites.find((c) => /printf|puts|write/.test(c.callee))?.address ||
        "<callsite_before_arg_setup>"
      const target = args.target || gotTargets[0] || "printf@got"
      const off = args.controlOffset || "<offset_to_saved_rbp>"
      candidates.push({
        name: "CALLSITE_FRAME_LEAK",
        priority: "P0",
        value: "high",
        frame_arg_offset: k ? `0x${k.toString(16)}` : "unknown",
        callsite,
        target,
        formula: k ? `saved_rbp = target + 0x${k.toString(16)}` : "saved_rbp = target + k",
        probe: k
          ? `payload = b'A'*${off} + p64(${target} + 0x${k.toString(16)}) + p64(${callsite})`
          : `payload = b'A'*${off} + p64(${target} + k) + p64(${callsite})`,
        confirm: "target bytes or raw libc/GOT pointer bytes are printed before crash/EOF",
        falsify:
          "the original callsite is reached with rbp formula but does not read/print target, or target is unreadable under this callsite",
        do_not_do_yet: [
          "fake-stack libc stability",
          "GOT-page rewrite loop",
          "format-write closure",
          "one_gadget polishing",
        ],
      })
    }
    if (/win|print_flag|backdoor/.test(lower))
      candidates.push({
        name: "DIRECT_WIN",
        priority: "P0",
        value: "high",
        probe: "minimal ret2win/control transfer",
        confirm: "flag/win executes",
        falsify: "unavailable control or required state impossible",
      })
    if (/format|%p|%s|%n/.test(lower))
      candidates.push({
        name: "FMT_LEAK_FIRST",
        priority: candidates.length ? "P1" : "P0",
        value: "medium",
        probe: "read-only positional leak map",
        confirm: "stable leak offset",
        falsify: "input is not interpreted as format",
      })
    const payload = {
      schema_version: "pwn_primitive_compressor.v1",
      primitive_candidates: candidates,
      do_first: candidates[0]?.probe || "collect callsite/control evidence",
      primitive_lock_card: candidates[0]
        ? {
            primitive_candidate: candidates[0].name,
            source: frameArg ? "frame-indexed callsite evidence" : "provided evidence",
            control: savedRbp ? "saved rbp/control evidence present" : "control evidence needs confirmation",
            formula: candidates[0].formula || "",
            first_probe: candidates[0].probe,
            oracle: candidates[0].confirm,
            status: "untested",
          }
        : null,
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_PRIMITIVE_COMPRESSOR",
      `do_first: ${payload.do_first}`,
      "primitive_candidates:",
      ...(candidates.length
        ? candidates.map(
            (c) =>
              `- ${c.priority} ${c.name}: formula=${c.formula || ""}; probe=${c.probe}; confirm=${c.confirm}; falsify=${c.falsify}`,
          )
        : ["- none"]),
      "primitive_lock_card:",
      payload.primitive_lock_card ? JSON.stringify(payload.primitive_lock_card) : "none",
    ].join("\n")
  },
})
