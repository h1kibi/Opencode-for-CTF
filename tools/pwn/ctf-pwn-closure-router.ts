import { tool } from "@opencode-ai/plugin"

function has(text: string, re: RegExp) {
  return re.test(text)
}

function pushRoute(
  queue: Array<{ id: string; why: string; next: string; downgrade: string }>,
  seen: Set<string>,
  route: { id: string; why: string; next: string; downgrade: string },
) {
  if (seen.has(route.id)) return
  seen.add(route.id)
  queue.push(route)
}

export default tool({
  description:
    "CTF pwn closure router: convert a confirmed primitive or near-success signal into a strict shortest-closure queue for hard PWN endgame.",
  args: {
    evidence: tool.schema
      .string()
      .describe(
        "Primitive notes, runner output, post-exploit behavior, seccomp hints, shell/no-shell observations, or likely flag-path evidence.",
      ),
  },
  async execute(args) {
    const text = String(args.evidence || "")
    const lower = text.toLowerCase()
    if (text.trim().length < 10) return "BLOCK: provide primitive, post-exploit, or closure evidence"

    const seccomp = has(lower, /seccomp|sandbox|orw|openat|sendfile/)
    const shellLikely = has(
      lower,
      /shell likely|interactive|pwned shell|got shell|one-shot command|command worked|whoami|pwd|ls/,
    )
    const fileReadLikely = has(
      lower,
      /file-read|cat \/flag|cat flag|read flag|open\(|sendfile|orw|stdout\/stderr differs|one-shot command/,
    )
    const promptDesync = has(
      lower,
      /prompt desync|no prompt|waiting for prompt|recvuntil|buffering|pacing|eof only after one command/,
    )
    const stdoutDiff = has(lower, /stdout\/stderr|stderr|fd 2|fd redirection/)
    const flagPathHint = has(lower, /\/flag|\.\/flag|flag.txt|app\/flag|source-confirmed flag path/)
    const directWin = has(lower, /ret2win|print_flag|backdoor|direct win/)
    const writableLongLived = has(
      lower,
      /\.bss|global data|global buffer|writable global|heap state|long-lived memory|parser buffer|file-like|file structure|scanf|fgets|read\(|recv\(|strcpy|memcpy/,
    )
    const outputPath = has(
      lower,
      /puts|printf|write\(|send\(|output path|prints secret|almost prints|partial flag|prefix of flag|near-secret output|secret-bearing data/,
    )
    const adjacency = has(
      lower,
      /adjacent|neighbor|next object|previous object|same region|string table|path overwrite|length overwrite|state-byte|format string overwrite|output hijack|data-only/,
    )
    const behaviorFlat = has(
      lower,
      /flat behavior|no differential|same-family failed twice|same output|unchanged output|no new differential/,
    )

    const queue: Array<{ id: string; why: string; next: string; downgrade: string }> = []
    const seen = new Set<string>()

    if (directWin) {
      pushRoute(queue, seen, {
        id: "direct_symbol_or_print_flag_closure",
        why: "direct win/read path is shorter than post-exploit shell shaping",
        next: "verify exact control and invoke the direct win/read path with minimum chain complexity",
        downgrade: "downgrade only if the direct symbol path is falsified by debugger or output evidence",
      })
    }

    if (writableLongLived && (outputPath || adjacency)) {
      pushRoute(queue, seen, {
        id: "data_only_output_hijack_or_adjacent_corruption",
        why: "attacker-controlled long-lived writable state plus an existing or nearby output consumer is often shorter than shell/ROP/file-write closure",
        next: "audit adjacent objects and test one output-path hijack, path overwrite, length overwrite, state-byte flip, or nearby string corruption that could carry secret bytes outward",
        downgrade:
          "downgrade only if adjacency and existing-output probes are flat and no nearby consumer can be influenced",
      })
    }

    if (fileReadLikely || seccomp) {
      pushRoute(queue, seen, {
        id: "direct_file_read_or_orw_closure",
        why: seccomp
          ? "execve may be blocked; direct file-read is shorter and more stable"
          : "near-success hints suggest file-read closure may already work without a full shell",
        next: flagPathHint
          ? "test the source-confirmed or hinted flag path with one direct read action"
          : "test one direct read path: /flag, ./flag, flag, or source-confirmed path",
        downgrade:
          "downgrade only if one-variable path checks are flat and the primitive cannot read/write output coherently",
      })
    }

    if (shellLikely) {
      pushRoute(queue, seen, {
        id: "one_shot_command_or_limited_shell_closure",
        why: "a limited shell or one-shot command path may be enough to read the flag without full TTY stability",
        next: "send one command only: pwd, ls, cat /flag, cat flag, or the source-confirmed flag path",
        downgrade:
          "downgrade if repeated single-command attempts show no output differential or only prompt-sync artifacts",
      })
    }

    if (stdoutDiff || promptDesync) {
      pushRoute(queue, seen, {
        id: "output_channel_or_prompt_sync_closure",
        why: "the exploit may already work, but closure is blocked by pacing or output channel mismatch",
        next: stdoutDiff
          ? "test one stdout/stderr redirection-aware read path or write-to-fd closure"
          : "slow down interaction and enforce one deterministic recv/send boundary before each command",
        downgrade:
          "downgrade if channel/pacing fixes produce no new differential and file-read/direct paths are stronger",
      })
    }

    if (behaviorFlat) {
      pushRoute(queue, seen, {
        id: "closure_owner_reclassification",
        why: "the current closure family is not producing expected differentials and should not monopolize more budget",
        next: "re-rank source_primitive, execution_primitive, exfil_primitive, and closure_owner; keep one orthogonal closure route alive and test it with one variable",
        downgrade: "downgrade only after a newly-ranked closure route also fails behaviorally",
      })
    }

    if (!queue.length) {
      pushRoute(queue, seen, {
        id: "primitive_to_minimum_closure_proof",
        why: "no clear closure owner is proven yet",
        next: "obtain one minimum local closure proof: ret2win, one read proof, one write proof, one syscall proof, or one data-only output-hijack proof",
        downgrade: "downgrade only after a different primitive offers a materially shorter flag path",
      })
    }

    const priority = queue.map((q, i) => `${i + 1}. ${q.id}`)

    return [
      "pwn_closure_router:",
      `seccomp_signal: ${seccomp}`,
      `shell_likely_signal: ${shellLikely}`,
      `file_read_likely_signal: ${fileReadLikely}`,
      `prompt_desync_signal: ${promptDesync}`,
      `stdout_stderr_diff_signal: ${stdoutDiff}`,
      `flag_path_hint_signal: ${flagPathHint}`,
      `direct_win_signal: ${directWin}`,
      `writable_long_lived_signal: ${writableLongLived}`,
      `existing_output_path_signal: ${outputPath}`,
      `adjacency_signal: ${adjacency}`,
      `behavior_flat_signal: ${behaviorFlat}`,
      "priority_queue:",
      ...priority.map((x) => `- ${x}`),
      "closure_routes:",
      ...queue.flatMap((q) => [
        `- route: ${q.id}`,
        `  - why: ${q.why}`,
        `  - next_probe: ${q.next}`,
        `  - downgrade_trigger: ${q.downgrade}`,
      ]),
      "stop_rule:",
      "- Once a shorter closure path is plausible, stop discovery-heavy exploration and change only one closure variable at a time.",
      "- Do not let the first strong primitive monopolize the queue if data-only corruption or output-path hijack is behaviorally closer to the flag.",
    ].join("\n")
  },
})
