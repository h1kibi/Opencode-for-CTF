import { tool } from "@opencode-ai/plugin"

export default tool({
  description:
    "CTF pwn fast skeleton hints: map a simple-pwn family to the fastest exploit skeleton plan, required first edits, and stop/escalation conditions.",
  args: {
    route: tool.schema.string().describe("Route family: ret2win | ret2libc | format | orw | heap-menu"),
    evidence: tool.schema.string().optional().describe("Optional short evidence or mitigation notes to refine hints."),
  },
  async execute(args) {
    const route = String(args.route || "").toLowerCase()
    const evidence = String(args.evidence || "").toLowerCase()
    const base = [
      "fast_skeleton_plan:",
      "template: {env:OPENCODE_CONFIG_DIR}/templates/solve_pwn.py",
      "rule: build exploit skeleton early, then tighten it with one variable at a time",
    ]
    const map: Record<string, string[]> = {
      ret2win: [
        "route_family: ret2win",
        "recommended_template_mode: direct_control_to_win",
        "required_fields:",
        "- binary_path",
        "- exact_offset",
        "- win_symbol_or_address",
        "missing_evidence_if_unknown:",
        "- exact_offset",
        "quick_fill_defaults:",
        "- payload_shape: flat({offset: win})",
        "- receive_mode: recvall_or_recvuntil_prompt",
        "next_patch_points:",
        "- set binary path",
        "- measure exact offset with ctf-pwn-crash-probe",
        "- resolve win/print_flag symbol",
        "- build flat payload offset -> win",
        "- use runner for local proof before extra gadget work",
        "cheap_oracle:",
        "- direct jump reaches win or flag-like output appears",
        "stop_if:",
        "- no control after 2 cheap same-family tries",
      ],
      ret2libc: [
        "route_family: ret2libc_two_stage",
        "recommended_template_mode: leak_then_reenter_then_close",
        "required_fields:",
        "- binary_path",
        "- libc_path",
        "- exact_offset",
        "- leak_function_and_target",
        "- return_point",
        "missing_evidence_if_unknown:",
        "- stable_leak",
        "- validated_libc_base",
        "quick_fill_defaults:",
        "- stage1: leak puts/write and return to main",
        "- stage2: system('/bin/sh') or direct closure route",
        "next_patch_points:",
        "- set binary/libc path",
        "- confirm exact offset/control",
        "- choose leak function and return point (often main)",
        "- parse leak and compute libc base only after leak class sanity",
        "- build second-stage system('/bin/sh') or direct closure route",
        "cheap_oracle:",
        "- stage1 leak parses cleanly and returns to controlled state",
        "stop_if:",
        "- leak class/base remains unstable or ambiguous",
      ],
      format: [
        "route_family: format_leak_first",
        "recommended_template_mode: read_first_format_harness",
        "required_fields:",
        "- send_recv_harness",
        "- offset_map",
        "- leak_parser",
        "missing_evidence_if_unknown:",
        "- positional_vs_nonpositional_behavior",
        "- writable_target_justification",
        "quick_fill_defaults:",
        "- first pass read-only with %p/%s leak mapping",
        "- delay %n until RELRO/writability is known",
        "next_patch_points:",
        "- build controlled send/recv harness",
        "- map offset with read-only probes first",
        "- parse leaked pointer classes before any %n",
        "- choose write target only after RELRO/writability is known",
        "cheap_oracle:",
        "- offset map yields repeatable pointer positions",
        "stop_if:",
        "- offset/leak shape is unstable after 2-3 controlled passes",
      ],
      orw: [
        "route_family: direct_orw",
        "recommended_template_mode: file_read_closure",
        "required_fields:",
        "- syscall_abi",
        "- writable_path_or_buffer",
        "- output_fd_or_socket_model",
        "missing_evidence_if_unknown:",
        "- allowlisted_syscalls",
        "- flag_path_candidate",
        "quick_fill_defaults:",
        "- closure target: open/read/write before shell cosmetics",
        "- prefer source-confirmed path over guessed path",
        "next_patch_points:",
        "- confirm syscall ABI and allowlist",
        "- locate writable path/buffer memory",
        "- model output fd/socket behavior",
        "- build open/read/write chain before shell cosmetics",
        "cheap_oracle:",
        "- partial file-read or near-secret output appears",
        "stop_if:",
        "- syscall allowlist or output model remains unclear",
      ],
      "heap-menu": [
        "route_family: menu_harness_then_primitive",
        "recommended_template_mode: menu_wrapper_then_reduce",
        "required_fields:",
        "- add_delete_edit_show_wrappers",
        "- size_index_lifetime_model",
        "- one_proven_primitive",
        "missing_evidence_if_unknown:",
        "- allocator_version",
        "- leak_or_overlap_path",
        "quick_fill_defaults:",
        "- wrapper functions first, technique naming later",
        "- prefer one primitive proof before closure debate",
        "next_patch_points:",
        "- create pwntools menu wrappers add/delete/edit/show",
        "- record index/size/lifetime rules",
        "- prove one primitive before naming a technique",
        "- if allocator/version complexity appears, leave fast lane",
        "cheap_oracle:",
        "- repeatable UAF/double-free/reuse signal",
        "stop_if:",
        "- allocator or glibc-version reasoning is required",
      ],
    }
    if (!map[route]) return "BLOCK: route must be one of ret2win | ret2libc | format | orw | heap-menu"
    const extra: string[] = []
    if (/pie/.test(evidence)) extra.push("- PIE evidence present: do not hardcode final gadgets before a code leak.")
    if (/canary/.test(evidence))
      extra.push("- Canary evidence present: prioritize leak or non-return overwrite before final chain.")
    if (/seccomp|sandbox/.test(evidence) && route !== "orw")
      extra.push("- Seccomp/sandbox clue present: closure may prefer ORW/file-read over shell.")
    if (/full relro/.test(evidence) && route === "format") extra.push("- Full RELRO: avoid assuming GOT overwrite.")
    if (/remote drift|remote fail|timeout|eof/.test(evidence))
      extra.push(
        "- Remote divergence clue present: do not mutate payload family before isolating transcript/prompt differences.",
      )
    return [...base, ...map[route], ...(extra.length ? ["route_specific_warnings:", ...extra] : [])].join("\n")
  },
})
