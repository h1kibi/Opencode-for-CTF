import { tool } from "@opencode-ai/plugin"

function normalizeLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function commonPrefixLen(a: string, b: string) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function has(text: string, re: RegExp) {
  return re.test(text)
}

export default tool({
  description:
    "CTF pwn remote drift check: classify why local exploit success diverges from remote behavior and rank the first rechecks.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Concise local-vs-remote notes, ctf-pwn-runner summary, or observed failure text."),
    localTranscript: tool.schema.string().optional().describe("Optional local transcript tail for structured diff hints."),
    remoteTranscript: tool.schema.string().optional().describe("Optional remote transcript tail for structured diff hints."),
  },
  async execute(args) {
    const text = (args.evidence || "").toLowerCase()
    if (text.trim().length < 10) return "BLOCK: provide local/remote drift evidence or runner output"

    const signals = {
      localWorks: has(text, /local works|local_success:\s*true|local_success":\s*true/),
      remoteFails: has(text, /remote fails|remote eof|timeout|remote_success:\s*false|remote_success:\s*untested/),
      timeout: has(text, /timeout/),
      eof: has(text, /eof/),
      crash: has(text, /sigsegv|crash|segmentation fault/),
      movaps: has(text, /movaps|alignment/),
      wrongLibc: has(text, /wrong libc|libc mismatch|ld mismatch/),
      promptSync: has(text, /prompt sync|buffering|newline|null handling|recvuntil/),
      seccomp: has(text, /seccomp|sandbox|orw/),
      fork: has(text, /fork|forking/),
    }

    const ranked = [
      signals.movaps ? "stack_alignment_before_gadget_rotation" : "",
      signals.wrongLibc ? "recheck_bundled_libc_ld_pair" : "",
      signals.promptSync || signals.eof ? "recheck_prompt_sync_buffering_and_newline_handling" : "",
      signals.timeout && !signals.seccomp ? "differentiate_timeout_from_waiting_for_prompt_or_crash" : "",
      signals.seccomp ? "prefer_orw_or_file_read_closure_over_shell_variants" : "",
      signals.fork ? "check_fork_server_canary_or_parent_child_behavior" : "",
      signals.localWorks && signals.remoteFails ? "preserve_local_proof_and_change_one_remote_assumption_only" : "",
    ].filter(Boolean)

    const local = String(args.localTranscript || "")
    const remote = String(args.remoteTranscript || "")
    const ll = local.trim().length >= 3 ? normalizeLines(local) : []
    const rl = remote.trim().length >= 3 ? normalizeLines(remote) : []
    const joinedLocal = ll.join("\n")
    const joinedRemote = rl.join("\n")
    const prefix = ll.length && rl.length ? commonPrefixLen(joinedLocal, joinedRemote) : 0
    const localPtrs = [...local.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0]).slice(0, 12)
    const remotePtrs = [...remote.matchAll(/0x[0-9a-fA-F]{4,16}/g)].map((m) => m[0]).slice(0, 12)
    const leakShapeSame = localPtrs.length && remotePtrs.length ? localPtrs[0].length === remotePtrs[0].length : false
    const transcriptRanked = ll.length && rl.length
      ? [
          ll.slice(-4).join(" | ") !== rl.slice(-4).join(" | ") ? "prompt_or_pacing_mismatch" : "",
          /eof|end of file|connection closed/i.test(remote) && !/eof|end of file|connection closed/i.test(local)
            ? "remote_eof_without_local_eof"
            : "",
          /timeout|timed out/i.test(remote) && !/timeout|timed out/i.test(local)
            ? "remote_timeout_without_local_timeout"
            : "",
          localPtrs.length !== remotePtrs.length || !leakShapeSame ? "leak_shape_difference" : "",
          prefix < Math.min(joinedLocal.length, joinedRemote.length) * 0.35 ? "early_transcript_divergence" : "",
        ].filter(Boolean)
      : []

    const firstChecks = [
      "Confirm the exact libc/ld pair used locally versus the remote assumption.",
      "Re-run with deterministic prompt sync and explicit recvuntil/sendafter boundaries.",
      "Check timeout versus EOF versus crash as separate outcomes, not one generic failure.",
      "If a libc crash suggests movaps/alignment, test one alignment fix before gadget rotation.",
      "If seccomp or sandbox evidence exists, stop shell-first mutation and test ORW/file-read closure.",
    ]

    return [
      "pwn_remote_drift_check:",
      `local_success_signal: ${signals.localWorks}`,
      `remote_failure_signal: ${signals.remoteFails}`,
      `timeout_signal: ${signals.timeout}`,
      `eof_signal: ${signals.eof}`,
      `crash_signal: ${signals.crash}`,
      `alignment_signal: ${signals.movaps}`,
      `libc_ld_signal: ${signals.wrongLibc}`,
      `prompt_sync_signal: ${signals.promptSync}`,
      `seccomp_signal: ${signals.seccomp}`,
      `fork_signal: ${signals.fork}`,
      "ranked_rechecks:",
      ...(ranked.length ? ranked.map((x) => `- ${x}`) : ["- gather more differential evidence first"]),
      "transcript_ranked_differences:",
      ...(transcriptRanked.length ? transcriptRanked.map((x) => `- ${x}`) : ["- none_or_not_provided"]),
      "first_checks:",
      ...firstChecks.map((x) => `- ${x}`),
      "stop_rule:",
      "- Do not brute-force more remote payload variants until one concrete drift hypothesis is tested under a single changed assumption.",
    ].join("\n")
  },
})
