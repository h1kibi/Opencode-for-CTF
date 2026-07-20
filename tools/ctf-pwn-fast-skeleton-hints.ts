import { tool } from "@opencode-ai/plugin"

const ROUTE_ALIASES: Record<string, string> = {
  ret2win: "ret2win",
  ret2libc: "ret2libc",
  format: "format",
  fmt: "format",
  orw: "orw",
  "heap-menu": "heap-menu",
  heap: "heap-menu",
  menuheap: "heap-menu",
}

const HINTS: Record<string, { templateMode: string; nextPatchPoints: string[]; stopIf: string }> = {
  ret2win: {
    templateMode: "direct_control_to_win",
    nextPatchPoints: [
      "set binary path",
      "measure exact offset with ctf-pwn-offset or ctf-pwn-crash-probe",
      "resolve win/print_flag symbol",
      "build flat payload offset -> win",
      "use runner for local proof before extra gadget work",
    ],
    stopIf: "no control after 2 cheap same-family tries",
  },
  ret2libc: {
    templateMode: "leak_then_reenter_then_close",
    nextPatchPoints: [
      "set binary/libc path",
      "confirm exact offset/control",
      "choose leak function and return point (often main)",
      "parse leak and compute libc base only after leak class sanity",
      "build second-stage system('/bin/sh') or direct closure route",
    ],
    stopIf: "leak class/base remains unstable or ambiguous",
  },
  format: {
    templateMode: "read_first_format_harness",
    nextPatchPoints: [
      "build controlled send/recv harness",
      "map offset with read-only probes first",
      "parse leaked pointer classes before any %n",
      "choose write target only after RELRO/writability is known",
    ],
    stopIf: "offset/leak shape is unstable after 2-3 controlled passes",
  },
  orw: {
    templateMode: "file_read_closure",
    nextPatchPoints: [
      "confirm syscall ABI and allowlist",
      "locate writable path/buffer memory",
      "model output fd/socket behavior",
      "build open/read/write chain before shell cosmetics",
    ],
    stopIf: "syscall allowlist or output model remains unclear",
  },
  "heap-menu": {
    templateMode: "menu_wrapper_then_reduce",
    nextPatchPoints: [
      "create pwntools menu wrappers add/delete/edit/show",
      "record index/size/lifetime rules",
      "prove one primitive before naming a technique",
      "if allocator/version complexity appears, leave fast lane",
    ],
    stopIf: "allocator or glibc-version reasoning is required",
  },
}

export default tool({
  description:
    "CTF pwn fast skeleton hints: map a simple-pwn family to the fastest exploit skeleton plan, required first edits, and stop conditions.",
  args: {
    route: tool.schema.string().describe("Route family: ret2win | ret2libc | format | orw | heap-menu"),
    evidence: tool.schema.string().optional().describe("Optional short evidence or mitigation notes to refine hints."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const routeKey = String(args.route || "").toLowerCase().replace(/[-_ ]+/g, "-")
    const route = ROUTE_ALIASES[routeKey]
    if (!route) return "BLOCK: route must be one of ret2win | ret2libc | format | orw | heap-menu"
    const evidence = String(args.evidence || "").toLowerCase()
    const hint = HINTS[route]
    const payload = {
      schema_version: "pwn_fast_skeleton_hints.v1",
      route_family: route,
      recommended_next_action: `ctf-pwn-template-init route=${route === "format" ? "fmt" : route === "heap-menu" ? "menu" : route}`,
      template_mode: hint.templateMode,
      best_fast_path:
        route === "ret2win"
          ? "build the shortest direct-control exploit before wider gadget hunting"
          : route === "ret2libc"
            ? "stabilize one leak, then close with the shortest libc-based path"
            : route === "format"
              ? "read-only leak mapping before any write primitive"
              : route === "orw"
                ? "prefer direct file-read closure over shell cosmetics"
                : "prove one heap primitive before allocator taxonomy",
      one_variable_probe:
        route === "ret2win" || route === "ret2libc"
          ? "confirm one exact offset/control fact before mutating the chain"
          : route === "format"
            ? "change one read-only format payload at a time"
            : route === "orw"
              ? "change one syscall/path/output assumption at a time"
              : "change one menu primitive assumption at a time",
      fallback_action: "if the route stalls, return to ctf-pwn-playbook-router and choose exactly one orthogonal route",
      stop_if: hint.stopIf,
      next_patch_points: hint.nextPatchPoints,
      route_specific_warnings: [
        /pie/.test(evidence) ? "PIE evidence present: do not hardcode final gadgets before a code leak." : "",
        /canary/.test(evidence) ? "Canary evidence present: prioritize leak or non-return overwrite before final chain." : "",
        /seccomp|sandbox/.test(evidence) && route !== "orw"
          ? "Seccomp/sandbox clue present: closure may prefer ORW/file-read over shell."
          : "",
        /full relro/.test(evidence) && route === "format" ? "Full RELRO: avoid assuming GOT overwrite." : "",
        /remote drift|remote fail|timeout|eof/.test(evidence)
          ? "Remote divergence clue present: do not mutate payload family before isolating transcript/prompt differences."
          : "",
      ].filter(Boolean),
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_FAST_SKELETON_HINTS",
      `route_family: ${payload.route_family}`,
      `template_mode: ${payload.template_mode}`,
      `best_fast_path: ${payload.best_fast_path}`,
      `one_variable_probe: ${payload.one_variable_probe}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `stop_if: ${payload.stop_if}`,
      "next_patch_points:",
      ...payload.next_patch_points.map((x) => `- ${x}`),
      "route_specific_warnings:",
      ...(payload.route_specific_warnings.length ? payload.route_specific_warnings.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
