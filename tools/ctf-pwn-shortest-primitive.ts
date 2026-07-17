import { tool } from "@opencode-ai/plugin"

export default tool({
  description:
    "CTF PWN shortest primitive checker: rank simpler frame-indexed/callsite/data-only/leak primitives before complex ROP or fake-stack routes.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Disassembly/decompilation/notes: callsites, rbp control, GOT/global targets, overwrite capability, gadgets.",
      ),
    mode: tool.schema.string().optional().describe("direct | medium | hard. Default medium."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const e = String(args.evidence || "")
    const lower = e.toLowerCase()
    const candidates: any[] = []
    const hasFrameArg =
      /\[rbp-0x10\]|\[rbp\s*-\s*0x10\]|lea\s+r(ax|di),\s*\[rbp|mov\s+rdi,\s*r(ax|bp)/i.test(e) &&
      /printf|puts|write|system|call/i.test(e)
    if (hasFrameArg)
      candidates.push({
        rank: 1,
        primitive: "frame-indexed callsite argument control",
        why: "existing callsite appears to derive first argument from rbp-relative memory",
        first_probe:
          "set rbp = target + displacement; reuse original printf/puts/write callsite against GOT/global string",
        cheaper_than: "fake stack stability and broad ROP",
      })
    if (/printf|puts|write/.test(lower) && /got|@got|global offset|puts@|printf@|read@/.test(lower))
      candidates.push({
        rank: 2,
        primitive: "read-only GOT/global leak",
        why: "output callsite plus GOT/global target evidence",
        first_probe: "leak one classified pointer before any write primitive",
        cheaper_than: "%n or ret2libc without leak",
      })
    if (/win|print_flag|cat flag|system\s*\(/i.test(e))
      candidates.push({
        rank: 3,
        primitive: "direct win/flag call",
        why: "flag function or shell command symbol/string present",
        first_probe: "ret2win or original callsite reentry with minimal alignment",
        cheaper_than: "libc resolution",
      })
    if (/leave\s*;\s*ret|pop rbp|saved rbp|stack pivot|bss/i.test(e))
      candidates.push({
        rank: 4,
        primitive: "saved-rbp pivot / leave-ret pseudostack",
        why: "pivot signals present",
        first_probe: "verify rbp and fake stack landing with stage harness before gadget expansion",
        cheaper_than: "blind ROP mutation",
      })
    if (/format|string|%p|%s|%n|printf\(/i.test(e))
      candidates.push({
        rank: 5,
        primitive: "format string leak-first",
        why: "format surface present",
        first_probe: "read-only %p/%s leak classification before %n",
        cheaper_than: "write-first fmt",
      })
    if (/free_hook|__malloc_hook|setcontext|uaf|tcache|fastbin/i.test(e))
      candidates.push({
        rank: 6,
        primitive: "heap hook/data-only closure",
        why: "heap closure tokens present",
        first_probe: "stabilize leak/runtime lock before hook write",
        cheaper_than: "unversioned heap exploitation",
      })
    const sorted = candidates.sort((a, b) => a.rank - b.rank)
    const payload = {
      schema_version: "pwn_shortest_primitive.v1",
      candidates: sorted,
      recommended_first: sorted[0] || null,
      anti_drift_rule:
        "Try the highest-ranked read-only/direct primitive before fake-stack, ROP, or write-heavy routes unless it is explicitly falsified.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_SHORTEST_PRIMITIVE",
      `recommended_first: ${payload.recommended_first?.primitive || "none"}`,
      "candidates:",
      ...(sorted.length
        ? sorted.map(
            (c) =>
              `- #${c.rank} ${c.primitive}: ${c.why}; first_probe=${c.first_probe}; cheaper_than=${c.cheaper_than}`,
          )
        : ["- none"]),
      `anti_drift_rule: ${payload.anti_drift_rule}`,
    ].join("\n")
  },
})
