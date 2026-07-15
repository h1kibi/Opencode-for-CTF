import { tool } from "@opencode-ai/plugin"

type Route = {
  id: string
  title: string
  score: number
  evidence: string[]
  firstProbe: string
  confirm: string
  falsify: string
  stopRule: string
  nextPatternQuery: string
}

function has(text: string, re: RegExp) {
  return re.test(text)
}

function add(routes: Route[], route: Omit<Route, "score" | "evidence">, score: number, evidence: string[]) {
  routes.push({ ...route, score, evidence })
}

function boolSignal(text: string, key: string, yesRe: RegExp, noRe?: RegExp) {
  const line = text.split(/\r?\n/).find((x) => x.toLowerCase().includes(key.toLowerCase())) || ""
  if (yesRe.test(line)) return true
  if (noRe?.test(line)) return false
  return undefined
}

function yesNo(value: boolean | undefined) {
  if (value === true) return "yes"
  if (value === false) return "no"
  return "unknown"
}

export default tool({
  description: "CTF pwn playbook router: convert ctf-binary-probe output or pwn evidence into top-3 exploit strategy seeds with confirm/falsify probes.",
  args: {
    evidence: tool.schema.string().describe("ctf-binary-probe output, checksec summary, or concise pwn evidence."),
    mode: tool.schema.string().optional().describe("direct | medium | hard. direct returns one fastest route, hard returns deeper top routes. Default medium."),
    maxRoutes: tool.schema.number().optional().describe("Maximum routes to return. Default 3, hard cap 5."),
    jsonOnly: tool.schema.boolean().optional().describe("Return machine-readable JSON instead of Markdown-like text. Default false."),
  },
  async execute(args) {
    const raw = args.evidence || ""
    const text = raw.toLowerCase()
    if (text.trim().length < 20) return "BLOCK: evidence is too short; run ctf-binary-probe or provide checksec/protocol/primitive clues"

    const mode = ["direct", "medium", "hard"].includes((args.mode || "").toLowerCase()) ? (args.mode || "medium").toLowerCase() : "medium"
    const routes: Route[] = []
    const nx = boolSignal(raw, "nx:", /yes|enabled|true/i, /no|disabled|false/i)
    const pie = boolSignal(raw, "pie:", /yes|enabled|true/i, /no|disabled|false/i)
    const canary = boolSignal(raw, "canary:", /yes|found|enabled|true/i, /no|disabled|false/i)
    const relroFull = has(text, /relro:\s*full|full relro/)
    const relroPartial = has(text, /relro:\s*partial|partial relro|no relro|relro:\s*none/)
    const staticBin = has(text, /static:\s*yes|statically linked|not a dynamic executable/)
    const seccomp = has(text, /seccomp:\s*clue|seccomp|prctl/)
    const win = has(text, /\b(win|print_flag|backdoor|give_flag|flag)\b/)
    const systemBinsh = has(text, /system|\/bin\/sh/)
    const fmt = has(text, /printf|fprintf|sprintf|format_candidate|format string|%p|%n/)
    const heap = has(text, /malloc|free|realloc|heap_candidate|tcache|fastbin|unsorted|uaf|double free|fsop/)
    const dangerousRead = has(text, /gets|scanf|strcpy|strcat|memcpy|read\(/)
    const cet = has(text, /cet_ibt:\s*clue|endbr|ibt|shstk|shadow stack/)
    const orwPreferred = has(text, /prefer_direct_file_read_or_orw_route_over_shell|orw_route_candidate|open-read-write|direct file-read|blocked shell/)
    const syscallAbiKnown = has(text, /syscall_abi_hints|arch_hint:\s*(amd64|i386|arm64)|syscall_number:\s*(rax|eax|x8)/)
    const ret2csuComplete = has(text, /gadget_shape:\s*complete_pop_and_call_shape|ret2csu_candidate_worth_testing_after_control_proof/)
    const ret2csuPartial = has(text, /ret2csu_partial_shape|gadget_shape:\s*(pop_shape_only|call_shape_only|symbol_only)/)
    const libcResolved = has(text, /pwn_libc_resolver:|glibc_version:\s*2\.|symbol_offsets:|bin_sh_offset:\s*0x/)
    const oneGadgetConstrained = has(text, /one_gadget_hints:|constraints:|one_gadget.*constraint/)
    const modernGlibc = has(text, /safe_linking_likely|malloc_free_hooks_removed_or_unreliable|do_not_default_to_malloc_free_hook_targets|glibc_version:\s*2\.(3[4-9]|4\d)/)
    const formatMapped = has(text, /pwn_format_map:|positional_behavior_clue|leak_class_candidates|write_gates|write_capability_candidate/)
    const formatWriteCandidate = has(text, /write_capability_candidate|positional_write_possible_if_offset_stable|n_specifier_seen_but_writability_unproven/)
    const heapMapped = has(text, /pwn_heap_menu_map:|operations_detected:|lifetime_control_present|primitive_queue:/)
    const heapLeakSurface = has(text, /leak_surface_possible|show-path leak proof/)
    const crashProbe = has(text, /pwn_crash_probe:|crash_detected:|ip_controlled:|offset_hint:/)
    const writableLongLived = has(text, /\.bss|global data|global buffer|writable global|heap state|long-lived memory|parser buffer|scanf|fgets|read\(|recv\(|strcpy|memcpy/)
    const outputPath = has(text, /puts|printf|write\(|send\(|output path|prints secret|almost prints|partial flag|prefix of flag|near-secret output|secret-bearing data/)
    const adjacency = has(text, /adjacent|neighbor|next object|previous object|same region|string table|path overwrite|length overwrite|state-byte|format string overwrite|output hijack|data-only/)
    const ipControlled = has(text, /ip_controlled:\s*true/)
    const crashNoControl = has(text, /crash_detected:\s*true/) && has(text, /ip_controlled:\s*false/)
    const offsetKnown = has(text, /offset_hint:\s*\d+/)
    const remoteDrift = has(text, /pwn_remote_drift_check:|remote_failure_signal:\s*true|ranked_rechecks:/)
    const localWorksRemoteFails = has(text, /local_success_signal:\s*true/) && has(text, /remote_failure_signal:\s*true/)
    const driftLibc = has(text, /libc_ld_signal:\s*true|recheck_bundled_libc_ld_pair/)
    const driftPrompt = has(text, /prompt_sync_signal:\s*true|recheck_prompt_sync_buffering_and_newline_handling/)
    const runnerSummary = has(text, /pwn_runner_summary:|script_ran_ok:|flag_detected:|shell_detected:/)
    const flagDetected = has(text, /flag_detected:\s*true|"flag_detected"\s*:\s*true/)
    const shellDetected = has(text, /shell_detected:\s*true|"shell_detected"\s*:\s*true/)
    const runnerCrash = has(text, /crash:\s*true|"crash"\s*:\s*true/)
    const runnerTimeout = has(text, /timeout:\s*true|"timeout"\s*:\s*true/)
    const scriptRanOkOnly = has(text, /script_ran_ok:\s*true|"script_ran_ok"\s*:\s*true/) && !flagDetected && !shellDetected
    const frameIndexedCallsite = has(text, /frame[-_ ]indexed|rbp[-_ ]relative|\[rbp-0x[0-9a-f]+\].*(printf|puts)|lea\s+r(ax|di),\s*\[rbp-0x[0-9a-f]+\].*call.*(printf|puts)/s)

    if (frameIndexedCallsite) add(routes, {
      id: "frame-indexed-callsite-leak",
      title: "P0 frame-indexed original callsite leak",
      firstProbe: "Compress original callsite into one probe: saved_rbp=got/global_target+k, saved_rip=callsite_before_arg_setup; leak GOT/global bytes before fake-stack or broad ROP.",
      confirm: "Target bytes or raw libc/GOT pointer bytes are printed before crash/EOF.",
      falsify: "The original callsite is reached with the rbp formula but does not consume/print target, or target is unreadable under that callsite.",
      stopRule: "Do not debug fake-stack libc crashes, GOT-page rewrite loops, or one_gadget constraints before this primitive is tested.",
      nextPatternQuery: "frame indexed callsite leak saved rbp printf got rbp target plus offset",
    }, 120 + (mode === "direct" ? 10 : 0), ["frame-indexed callsite", "saved rbp argument selector"])

    if (win && pie === false) add(routes, {
      id: "ret2win-direct",
      title: "Fixed-address ret2win / print_flag path",
      firstProbe: "Prove offset/control with cyclic or debugger, then call win/print_flag with required alignment/arguments.",
      confirm: "RIP/control reaches win-like function locally or flag path executes.",
      falsify: "No control primitive or win requires unavailable state/arguments.",
      stopRule: "Do not build libc chain before direct win probe fails.",
      nextPatternQuery: "pwn ret2win no pie no canary win function offset control",
    }, 95 + (mode === "direct" ? 15 : 0), ["win-like symbol/string", "PIE disabled"])

    if (canary === false && nx === true && (pie === false || systemBinsh || dangerousRead || ipControlled)) add(routes, {
      id: "ret2libc-or-rop",
      title: "ret2libc / ROP after control proof",
      firstProbe: "Prove RIP control; if PIE/ASLR/libc unknown, leak puts/write/GOT or stack/libc pointer before stage2.",
      confirm: "Stable control plus valid base/leak supports a two-stage chain.",
      falsify: "Canary/control missing or no leak path when PIE/ASLR requires one.",
      stopRule: "After crashes, check alignment/libc/prompt/CET before rotating gadgets.",
      nextPatternQuery: "ret2libc crash movaps wrong libc prompt sync one_gadget",
    }, 85 + (pie === false ? 8 : 0) + (systemBinsh ? 5 : 0) + (libcResolved ? 8 : 0) + (ipControlled ? 8 : 0) + (offsetKnown ? 3 : 0) - (oneGadgetConstrained ? 3 : 0) + (mode === "direct" && pie === false ? 6 : 0), ["NX enabled", "canary absent", pie === false ? "PIE disabled" : "leak may be needed", libcResolved ? "libc resolver evidence" : "libc unresolved", ipControlled ? "crash probe shows IP control" : "control proof needed", oneGadgetConstrained ? "one_gadget constraints need proof" : "classic ROP preferred before one_gadget"])

    if (nx === false && canary === false) add(routes, {
      id: "shellcode",
      title: "Shellcode route with executable memory",
      firstProbe: "Confirm executable stack/region, bad chars, input transform, register state, and seccomp before shellcode.",
      confirm: "Controlled jump reaches shellcode or stage-1 read stub pulls stage-2.",
      falsify: "NX/transform/seccomp prevents executable payload or no control primitive.",
      stopRule: "If shell blocked or seccomp appears, pivot to ORW/syscall route.",
      nextPatternQuery: "pwn shellcode nx disabled bad chars stage two read seccomp",
    }, 78, ["NX disabled", "canary absent"])

    if (fmt || formatMapped) add(routes, {
      id: "format-string-map",
      title: "Format string offset/leak/write map",
      firstProbe: "Use ctf-pwn-format-map output or build a read-only positional offset map; classify leaks before any %n write.",
      confirm: "Stable offset and useful stack/libc/PIE/canary leak or write target.",
      falsify: "Input is not format-interpreted or no output/side-effect oracle exists.",
      stopRule: "Do not write until offset, target, write size, and RELRO/writability are known.",
      nextPatternQuery: "format string printf offset leak canary got relro",
    }, 88 + (formatMapped ? 8 : 0) + (formatWriteCandidate ? 4 : 0) + (relroPartial ? 5 : 0) + (mode === "hard" ? 4 : 0), [formatMapped ? "format-map evidence" : "printf/format clue", formatWriteCandidate ? "%n/write candidate gated" : "read-first map required", relroPartial ? "GOT write may be possible" : relroFull ? "Full RELRO" : "RELRO unknown"])

    if (heap || heapMapped) add(routes, {
      id: "heap-menu-primitive",
      title: "Heap menu state and primitive proof",
      firstProbe: "Use ctf-pwn-heap-menu-map output: reduce add/delete/edit/show lifecycle, then prove leak/UAF/reuse/write before named techniques.",
      confirm: "Repeatable heap primitive across clean runs with known chunk layout.",
      falsify: "No controllable heap state or oracle after menu mapping.",
      stopRule: "Do not try named houses/tcache/FSOP before allocator/version/primitive evidence.",
      nextPatternQuery: "heap menu add delete edit tcache double free safe linking",
    }, 82 + (heapMapped ? 8 : 0) + (heapLeakSurface ? 4 : 0) + (modernGlibc ? 3 : 0) + (mode === "hard" ? 8 : 0), [heapMapped ? "heap-menu-map evidence" : "heap allocator clue", heapLeakSurface ? "leak surface possible" : "leak surface unknown", modernGlibc ? "modern glibc constraints" : "allocator version still needed"])

    if ((writableLongLived && outputPath) || adjacency) add(routes, {
      id: "data-only-adjacent-output-hijack",
      title: "Data-only corruption / adjacent output-hijack route",
      firstProbe: "Audit adjacent long-lived objects and test one path/length/state/string overwrite that reuses an existing puts/printf/write/send consumer.",
      confirm: "One adjacency probe changes secret-bearing output, path consumption, length/state behavior, or extends an existing output path.",
      falsify: "Writable long-lived memory exists but nearby consumers or output paths cannot be influenced behaviorally.",
      stopRule: "Do not jump to shell/ROP/file-write expansion before one adjacency/output-hijack probe is tried when secret-bearing output is already nearby.",
      nextPatternQuery: "pwn data-only corruption bss global adjacent string output hijack path overwrite length state",
    }, 91 + (outputPath ? 8 : 0) + (adjacency ? 8 : 0) + (has(text, /partial flag|prefix of flag|almost prints/) ? 6 : 0) + (mode === "hard" ? 4 : 0), [writableLongLived ? "writable long-lived memory" : "adjacency clue", outputPath ? "existing output path present" : "output path inferred", adjacency ? "adjacent overwrite clue" : "adjacency should be audited"])

    if (seccomp || orwPreferred) add(routes, {
      id: "seccomp-orw-syscall",
      title: "Seccomp ORW / syscall route",
      firstProbe: "Run or use ctf-pwn-syscall-orw-check output: verify ABI registers, syscall allowlist, writable buffer, and stdout/socket write closure before shell attempts.",
      confirm: "Allowed syscall path reaches flag read/write or explains shell failure.",
      falsify: "No seccomp evidence; shell failure is due to crash/sync/base issue.",
      stopRule: "Do not keep trying /bin/sh variants after seccomp evidence.",
      nextPatternQuery: "seccomp shell blocked open read write srop syscall",
    }, 90 + (orwPreferred ? 12 : 0) + (syscallAbiKnown ? 4 : 0) + (mode === "hard" ? 6 : 0), [seccomp ? "seccomp/sandbox clue" : "ORW/direct file-read clue", syscallAbiKnown ? "syscall ABI known" : "syscall ABI needs check"])

    if (staticBin) add(routes, {
      id: "static-syscall-rop",
      title: "Static binary syscall ROP / embedded gadgets",
      firstProbe: "Search syscall gadgets and writable memory; prefer ret2syscall/SROP over libc leak.",
      confirm: "Gadget set can load syscall number/args and reach syscall; writable path for strings exists.",
      falsify: "No control primitive or no usable syscall/gadget coverage.",
      stopRule: "Do not spend time on libc leak for static binary unless a dynamic libc is proven.",
      nextPatternQuery: "static binary syscall rop ret2syscall srop writable memory",
    }, 76, ["static binary"])

    if (ret2csuComplete || ret2csuPartial || has(text, /__libc_csu_init|ret2csu/)) add(routes, {
      id: "ret2csu-call-primitive",
      title: "ret2csu controlled call route",
      firstProbe: "Use ctf-pwn-ret2csu-check output: require control proof, paired pop/call csu gadget shape, callable pointer, rbx/rbp loop setup, and argument mapping.",
      confirm: "A controlled csu call reaches a benign imported function with expected arguments under debugger.",
      falsify: "Missing paired gadget shape, no callable pointer, no control proof, or simpler pop-gadget route dominates.",
      stopRule: "Do not promote ret2csu if only symbol/partial shape exists and no missing-gadget reason is proven.",
      nextPatternQuery: "ret2csu pop rbx rbp r12 r13 r14 r15 call gadget missing pop rdx",
    }, 72 + (ret2csuComplete ? 16 : 0) - (ret2csuPartial ? 10 : 0) + (pie === false ? 4 : 0), [ret2csuComplete ? "complete ret2csu gadget shape" : ret2csuPartial ? "partial ret2csu shape" : "ret2csu clue", pie === false ? "PIE disabled" : "PIE/code base may be needed"])

    if (cet) add(routes, {
      id: "cet-ibt-crash-triage",
      title: "CET/IBT-aware control-flow triage",
      firstProbe: "If indirect branch crashes, distinguish wrong address from CET/IBT/valid-target constraint and consider syscall-oriented routes.",
      confirm: "Crash site or disassembly shows ENDBR/IBT/CET constraint affects target selection.",
      falsify: "Crash is explained by bad base/alignment/prompt sync.",
      stopRule: "Do not rotate non-ENDBR indirect targets without a CET hypothesis.",
      nextPatternQuery: "pwn CET IBT endbr ret2libc crash syscall rop",
    }, 65, ["CET/IBT clue"])

    if (crashProbe && !ipControlled) add(routes, {
      id: "crash-control-reduction",
      title: "Crash without proven IP control",
      firstProbe: "Use ctf-pwn-crash-probe details to adjust protocol, input length, newline/null handling, argv/stdin path, and crash site before exploit route selection.",
      confirm: "A follow-up probe turns crash into IP/control, leak, or clear non-control bug class.",
      falsify: "Crash is unrelated to controlled input or belongs to another surface.",
      stopRule: "Do not build ROP from a SIGSEGV until offset/control or an alternate primitive is proven.",
      nextPatternQuery: "pwn crash no rip control cyclic offset protocol newline stdin argv",
    }, 70 + (crashNoControl ? 8 : 0), ["crash probe evidence", crashNoControl ? "crash without IP control" : "control unresolved"])

    if (remoteDrift) add(routes, {
      id: "remote-drift-recheck",
      title: "Local/remote drift recheck before payload mutation",
      firstProbe: "Use ctf-pwn-remote-drift-check ranked_rechecks: test exactly one drift hypothesis such as libc/ld, prompt sync, alignment, seccomp, timeout/EOF, or fork behavior.",
      confirm: "One changed remote assumption explains the divergence while preserving local proof.",
      falsify: "Remote failure reproduces locally or contradicts the selected drift hypothesis.",
      stopRule: "Do not brute-force remote variants while local proof and remote drift cause are unresolved.",
      nextPatternQuery: "pwn local works remote fails libc prompt sync movaps timeout eof fork",
    }, 86 + (localWorksRemoteFails ? 10 : 0) + (driftLibc ? 5 : 0) + (driftPrompt ? 4 : 0), [localWorksRemoteFails ? "local proof remote failure" : "remote drift evidence", driftLibc ? "libc/ld drift clue" : driftPrompt ? "prompt sync drift clue" : "drift class needs one-variable test"])

    if (runnerSummary && !flagDetected) add(routes, {
      id: "runner-result-closure-check",
      title: "Runner result is not final success yet",
      firstProbe: "Use ctf-pwn-runner summary: distinguish flag, shell, crash, timeout, and script_ran_ok; convert shell to flag read or debug crash/timeout before final reporting.",
      confirm: "Runner output contains a verified flag or a shell plus confirmed flag read within CTF scope.",
      falsify: "Only script_ran_ok, timeout, or crash is present without flag/shell proof.",
      stopRule: "Do not report success from script_ran_ok alone; SIGSEGV after payload is failure unless flag was already captured.",
      nextPatternQuery: "pwn runner script ran ok no flag shell crash timeout final verification",
    }, 92 + (shellDetected ? 8 : 0) - (runnerCrash ? 8 : 0) - (runnerTimeout ? 6 : 0) - (scriptRanOkOnly ? 4 : 0), [shellDetected ? "shell detected but flag not verified" : scriptRanOkOnly ? "script ran ok is not success" : "runner needs closure", runnerCrash ? "runner crash" : runnerTimeout ? "runner timeout" : "no crash/timeout clue"])

    if (!routes.length) add(routes, {
      id: "primitive-discovery",
      title: "Primitive discovery before technique selection",
      firstProbe: "Model protocol and reproduce crash/oracle; use cyclic/debugger/source audit to classify control/leak/write/logic primitive.",
      confirm: "A reproducible primitive or direct flag path is observed.",
      falsify: "No native pwn primitive; pivot to reverse/misc/web/crypto as appropriate.",
      stopRule: "Do not choose ret2libc/heap/fmt until a primitive is proven.",
      nextPatternQuery: "pwn primitive first checksec crash leak write control",
    }, 50, ["no strong route clue"])

    const defaultRoutes = mode === "direct" ? 1 : mode === "hard" ? 5 : 3
    const maxRoutes = Math.max(1, Math.min(args.maxRoutes ?? defaultRoutes, 5))
    const top = routes.sort((a, b) => b.score - a.score).slice(0, maxRoutes)
    const signalSummary = [
      `nx=${yesNo(nx)}`,
      `pie=${yesNo(pie)}`,
      `canary=${yesNo(canary)}`,
      relroFull ? "relro=full" : relroPartial ? "relro=partial_or_none" : "relro=unknown",
      staticBin ? "static=yes" : "static=unknown_or_no",
      seccomp ? "seccomp=yes" : "seccomp=unknown_or_no",
      ipControlled ? "ip_control=yes" : crashProbe ? "ip_control=no_or_unknown" : "ip_control=not_checked",
      offsetKnown ? "offset=known" : "offset=unknown",
      libcResolved ? "libc=resolved" : "libc=unresolved",
      formatMapped ? "format_map=yes" : "format_map=no",
      heapMapped ? "heap_menu_map=yes" : "heap_menu_map=no",
      writableLongLived ? "writable_long_lived=yes" : "writable_long_lived=no",
      outputPath ? "existing_output_path=yes" : "existing_output_path=no",
      adjacency ? "adjacency_clue=yes" : "adjacency_clue=no",
      remoteDrift ? "remote_drift=yes" : "remote_drift=no",
      runnerSummary ? "runner_summary=yes" : "runner_summary=no",
      flagDetected ? "flag_detected=yes" : "flag_detected=no",
      shellDetected ? "shell_detected=yes" : "shell_detected=no",
    ]
    const signals = {
      nx,
      pie,
      canary,
      relro_full: relroFull,
      relro_partial_or_none: relroPartial,
      static_binary: staticBin,
      seccomp,
      win,
      system_binsh: systemBinsh,
      format_candidate: fmt || formatMapped,
      heap_candidate: heap || heapMapped,
      writable_long_lived: writableLongLived,
      existing_output_path: outputPath,
      adjacency_clue: adjacency,
      ip_controlled: ipControlled,
      offset_known: offsetKnown,
      libc_resolved: libcResolved,
      one_gadget_constrained: oneGadgetConstrained,
      modern_glibc: modernGlibc,
      orw_preferred: orwPreferred,
      syscall_abi_known: syscallAbiKnown,
      ret2csu_complete: ret2csuComplete,
      ret2csu_partial: ret2csuPartial,
      remote_drift: remoteDrift,
      runner_summary: runnerSummary,
      flag_detected: flagDetected,
      shell_detected: shellDetected,
      runner_crash: runnerCrash,
      runner_timeout: runnerTimeout,
    }
    const closurePriority = flagDetected
      ? "final_flag_verified_stop"
      : shellDetected
        ? "shell_to_flag_read_before_final"
        : orwPreferred || seccomp
          ? "direct_file_read_or_orw"
          : (writableLongLived && outputPath) || adjacency
            ? "data_only_or_output_hijack"
            : win && pie === false
              ? "direct_win"
              : ipControlled
                ? "control_to_leak_or_call_chain"
                : runnerCrash || crashProbe
                  ? "stabilize_crash_control"
                  : "primitive_discovery"
    if (args.jsonOnly) {
      return JSON.stringify({
        pwn_playbook_router: {
          schema_version: "pwn_playbook_router.v1",
          mode,
          routes_considered: routes.length,
          routes_returned: top.length,
          signal_summary: signalSummary,
          signals,
          closure_priority: closurePriority,
          top_routes: top.map((r, i) => ({ rank: i + 1, ...r })),
        },
      }, null, 2)
    }
    return [
      "pwn_playbook_router:",
      "schema_version: pwn_playbook_router.v1",
      `mode: ${mode}`,
      `routes_considered: ${routes.length}`,
      `routes_returned: ${top.length}`,
      "signal_summary:",
      ...signalSummary.map((x) => `- ${x}`),
      `closure_priority: ${closurePriority}`,
      "top_routes:",
      ...top.flatMap((r, i) => [
        `- #${i + 1} id=${r.id} score=${r.score}`,
        `  title: ${r.title}`,
        `  evidence: ${r.evidence.join(" | ")}`,
        `  first_probe: ${r.firstProbe}`,
        `  confirm: ${r.confirm}`,
        `  falsify: ${r.falsify}`,
        `  stop_rule: ${r.stopRule}`,
        `  next_pattern_query: ${r.nextPatternQuery}`,
      ]),
      "decision_contract:",
      mode === "direct" ? "- Direct mode: run only the top route's first_probe unless new evidence contradicts it." : "- Pick at most one route for the next probe, or top-3 for ctf-decision-state ranking.",
      mode === "hard" ? "- Hard mode: preserve alternative routes as pivots, but still run one variable per probe." : "- Escalate to hard mode only when two strong routes fail or the target is clearly multi-stage.",
      "- Convert the route into one confirm/falsify probe; do not execute multiple routes in parallel.",
      "- If the route stalls, use its next_pattern_query with ctf-pattern-card-search category=pwn.",
    ].join("\n")
  },
})
