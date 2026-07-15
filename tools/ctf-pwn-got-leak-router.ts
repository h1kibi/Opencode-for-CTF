import { tool } from "@opencode-ai/plugin"

function has(text: string, re: RegExp) {
  return re.test(text)
}

export default tool({
  description: "CTF pwn got leak router: decide whether GOT contents can be reused as strings, pointers, or indirect parameters and suggest short leak routes such as rbp-k to got entry pivots.",
  args: {
    evidence: tool.schema.string().describe("Source snippet, decompilation, disassembly, or notes involving printf/puts/fgets/read and GOT/global pointers."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    if (text.trim().length < 16) return "BLOCK: provide evidence involving printf/puts/GOT/global-pointer flow"
    const lower = text.toLowerCase()
    const signals = [] as string[]
    if (has(lower, /lea\s+rax,\s*\[rbp-0x[0-9a-f]+\]/) && has(lower, /mov\s+rdi,\s*rax/) && has(lower, /printf@plt|puts@plt/)) signals.push("rbp-relative-pointer-fed-into-print")
    if (has(lower, /lea\s+r(ax|di|si|dx|cx|8|9),\s*\[rbp-0x[0-9a-f]+\]/) && has(lower, /mov\s+rdi,\s*r(ax|di|si|dx|cx|8|9)/) && has(lower, /printf@plt|puts@plt|call.*printf|call.*puts/)) signals.push("frame-indexed-first-argument-callsite")
    if (has(lower, /leave\s*;?\s*ret|\bleave\b/) && has(lower, /rbp-0x[0-9a-f]+/)) signals.push("leave-ret-pseudostack-mid-function-risk")
    if (has(lower, /call.*<(printf|puts)@plt>|call.*printf|call.*puts/) && has(lower, /rbp-0x[0-9a-f]+/)) signals.push("possible-mid-function-reentry-callsite")
    if (has(lower, /@got/) || has(lower, /got\.plt|\.got/)) signals.push("got-surface-present")
    if (has(lower, /printf@plt/) && has(lower, /mov\s+rdi,\s*rax|mov\s+rsi,\s*rax/)) signals.push("printable-pointer-consumer")
    if (has(lower, /%s|%p|puts\s*\(|printf\s*\(/)) signals.push("string-or-pointer-output-path")
    const routes = [] as string[]
    if (signals.includes("rbp-relative-pointer-fed-into-print") && signals.includes("got-surface-present")) {
      signals.push("FRAME_INDEXED_PRINTF_LEAK")
      routes.push("control rbp so rbp-k lands on a GOT entry or nearby global pointer and let the existing print path leak it")
    }
    if (signals.includes("string-or-pointer-output-path")) {
      routes.push("classify whether the consumer dereferences as string, prints raw pointer, or forwards as indirect argument before assuming classic ret2libc")
    }
    if (signals.includes("frame-indexed-first-argument-callsite")) {
      routes.push("treat this as frame-indexed callsite reuse: set saved rbp so rbp-k points at GOT/global/string, then re-enter only after rdi/rsi/rdx state is verified")
    }
    if (signals.includes("leave-ret-pseudostack-mid-function-risk")) {
      routes.push("use ctf-pwn-stage-harness preset=leave_ret_pseudostack_midcall and ctf-pwn-stage-delta-runner before promoting ordinary ROP")
    }
    const frameOff = (text.match(/\[rbp\s*-\s*0x([0-9a-f]+)\]/i)?.[1])
    const k = frameOff ? `0x${parseInt(frameOff, 16).toString(16)}` : "k"
    const gotNames = ["printf", "puts", "read", "write", "__libc_start_main"].filter((name) => new RegExp(name, "i").test(text) || signals.includes("got-surface-present"))
    const candidateTargets = gotNames.slice(0, 5).map((name) => ({
      target: `${name}@got`,
      rbp: `${name}@got + ${k}`,
      why: `${name} GOT entry may leak resolved code pointer or readable bytes through original print callsite`,
    }))
    const primitiveProbe = signals.includes("frame-indexed-first-argument-callsite") || signals.includes("FRAME_INDEXED_PRINTF_LEAK")
      ? {
          name: "FRAME_INDEXED_CALLSITE_LEAK",
          priority: "P0",
          frame_arg_offset: k,
          candidate_targets: candidateTargets.length ? candidateTargets : [{ target: "printf@got", rbp: `printf@got + ${k}`, why: "default first GOT leak target" }],
          payload_shape: `payload = b'A'*<offset_to_saved_rbp> + p64(target + ${k}) + p64(<callsite_before_arg_setup>)`,
          oracle: "raw pointer/string bytes printed before crash/EOF",
          note: "This is a primitive validation probe, not a closure chain.",
        }
      : null
    const payload = {
      schema_version: "pwn_got_leak_router.v1",
      signals,
      routes,
      primitive_probe: primitiveProbe,
      recommended_next: routes.length
        ? "test the shortest existing print path before wider gadget/libc drift"
        : "collect more evidence around rbp-relative pointers, GOT entries, and print consumers",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_got_leak_router:",
      "signals:",
      ...(signals.length ? signals.map((x: string) => `- ${x}`) : ["- none"]),
      "routes:",
      ...(routes.length ? routes.map((x: string) => `- ${x}`) : ["- none"]),
      "primitive_probe:",
      ...(primitiveProbe ? [
        `- name: ${primitiveProbe.name}`,
        `- priority: ${primitiveProbe.priority}`,
        `- frame_arg_offset: ${primitiveProbe.frame_arg_offset}`,
        `- payload_shape: ${primitiveProbe.payload_shape}`,
        `- oracle: ${primitiveProbe.oracle}`,
        ...primitiveProbe.candidate_targets.map((t) => `- target: ${t.target}; rbp=${t.rbp}; why=${t.why}`),
      ] : ["- none"]),
      `recommended_next: ${payload.recommended_next}`,
    ].join("\n")
  },
})
