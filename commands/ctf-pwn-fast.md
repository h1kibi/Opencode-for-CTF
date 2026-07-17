---
description: Compatibility entry: route a simple/medium PWN fast solve into ctf-fast
agent: ctf-expert
subtask: false
---

Start a simple/medium PWN fast-lane solve through `ctf-fast`. This is a compatibility entry; the old dedicated primary fast-PWN mode has been merged into the fast execution lane.

Challenge/target:
$ARGUMENTS

Fast contract:
- Authorized CTF/lab/local PWN only.
- Native PWN evidence must dominate: ELF/libc/ld/checksec/crash/control/fmt/heap/seccomp/ROP/shellcode.
- 15-minute soft budget: solve, near-closure exploit template, or compact handoff.
- `exploit.py` is working memory; create/update it as soon as one route is plausible.
- Do not spawn subagents or team mode. Do not load decision-state machinery in fast mode.
- For autonomy bias, fast-lane boundary, and runtime/helper selection, treat `references/pwn-fast-autonomy.md`, `references/pwn-mode-boundary.md`, and `references/pwn-runtime-trigger-matrix.md` as the shared rule source.
- If a canonical closure chain is already visible, stop helper growth early: prefer exploit editing over more explanation. Use `references/pwn-anti-overcomplication.md` when the branch starts drifting into slot/object semantics instead of a shorter exploit.

Opening sequence:
1. Run `ctf-pwn-fast-bootstrap` or follow `/ctf-pwn-open`: artifact map -> route -> template -> next probe.
    - Treat `route_scores` as routing pressure, not certainty.
    - If one route already looks plausible and the next payload change has a clear oracle, prefer editing `exploit.py` over opening more helper steps.
    - If a 20-40 line exploit skeleton is already obvious, treat the branch as closure mode and do not expand helper usage unless a concrete blocker appears.
    - If helper choice or runtime lock is unclear, consult `references/pwn-fast-autonomy.md`, `references/pwn-mode-boundary.md`, and `references/pwn-runtime-trigger-matrix.md` before mutating payloads.
   - If `ctf-binary-probe`, `ctf-elf-slice`, or source notes show `lea r?, [rbp-k] -> mov rdi, r? -> printf/puts`, run `ctf-pwn-stack-frame-solver` immediately.
   - If the solver still exposes an `rbp-k` leak surface, run `ctf-pwn-got-leak-router` before any fake-stack or GOT-hijack closure branch.
2. Use route templates:
   - ret2win: `templates/pwn_fast_ret2win.py`
   - ret2libc: `templates/pwn_fast_ret2libc.py`
   - fmt: `templates/pwn_fast_fmt.py`
   - shellcode / jmp-rsp / exec-stack / short-stager: `templates/pwn_fast_shellcode.py`
   - ORW/static/seccomp: `templates/pwn_fast_orw.py`
   - menu heap: `templates/pwn_fast_menu.py`
   - raw/unknown: `templates/pwn_fast_raw.py`
3. If the challenge ships `libc.so.6` or `ld`, run `ctf-pwn-libc-runtime-doctor` before proving heap/overlap/tcache behavior on the wrong pwnlab base.
4. Use `ctf-pwn-template-init` to create `exploit.py`; prefer `ctf-pwn-runbox` to start the container and `ctf-pwn-container-probe` to verify it before your first exploit run.
5. Keep exploit execution and remote pwntools sessions inside the chosen container whenever Docker is selected.
   - On Windows + Linux ELF, treat `ctf-pwn-docker-runner` as the default executor once the Linux substrate is locked; do not burn a host-side `ctf-pwn-runner` call first unless you are intentionally checking the host guardrail.
6. If source/decompilation or behavior suggests exact-length reads, mixed menu/raw phases, or prompt pollution, use `references/pwn-runtime-trigger-matrix.md` and run `ctf-pwn-menu-contract-probe` before more probes so helper semantics are fixed early.
7. If the target looks like a checker loop with one large stack read, explicit null termination, or indexed byte writes, run `ctf-pwn-redflag-panel` before drifting into symbolic constraints or generic gadget-first routes.
   - For repeated blind remote probes, prefer `ctf-pwn-expect-runner retries=<n> cooldownMs=<ms>` so transient timeout noise is absorbed without manual reconnect loops.
   - If the oracle is statistical or side-channel-like, prefer `ctf-pwn-template-init route=blind` before writing custom reconnect/vote code.
8. If `FRAME_INDEXED_PRINTF_LEAK` is plausible, treat frame-based leak validation as mandatory before template-first ret2libc closure.
9. On Windows, do not use `ctf-pwn-runner` as a host-side verifier for Linux ELF pwntools scripts; if it reports `host_execution_blocked`, switch to `ctf-pwn-docker-runner` or `ctf-pwn-wsl-runner` immediately.
10. If `ctf-binary-probe` reports `probe_backend: docker_fallback`, trust the container-side mitigation matrix over missing host ELF tools.

Route pressure:
- no canary + no PIE + win/backdoor/system -> ret2win first.
- obvious fmt -> leak-first, `ctf-pwn-format-map` before `%n`.
- bundled libc + leak path -> `ctf-pwn-libc-resolver` and two-stage ret2libc.
- bundled libc + bundled ld or glibc mismatch suspicion -> `ctf-pwn-libc-runtime-doctor` before validating heap, overlap, or seccomp behavior.
- static/seccomp/blocked shell -> `ctf-pwn-syscall-orw-check`, prefer file read.
- heap menu -> prove one primitive only; allocator reasoning means handoff.
- exact-length or mixed menu/raw read contract, local/remote drift, or frame-indexed print-path uncertainty -> use `references/pwn-runtime-trigger-matrix.md`; for transport drift keep `ctf-pwn-io-diff-check` explicit before gadget/libc changes.
- if `ctf-pwn-docker-runner` output is long or truncated, use `saveOutput=true` or rely on truncation auto-save and continue from `output_path` instead of re-running blind.
- if a higher-priority canonical closure family is still live (`ret2win`, `pivot+bss`, `single leak + replay`, `ORW`), do not widen into shell-aesthetic or heavier routes without a real falsifier.

Escalate to `ctf-expert` when runtime alignment, parser effects, unstable leaks, allocator internals, non-trivial seccomp, repeated gdb, or multiple serious families dominate; `references/pwn-mode-boundary.md` is the shared threshold card.

Autonomy rule:
- If the next useful action is obvious, the oracle is clear, and there is no strong runtime/helper uncertainty, do not add extra helper steps—edit or run the exploit.
- If uncertainty is real, open exactly one helper that removes it, then return to exploit iteration.

Fast handoff:
- Use `/ctf-pwn-handoff` and `templates/pwn_fast_handoff.md`.
- Report only strongest evidence, blocker, exploit path, best next master-controlled probe, and contest_meta.

Output style:
- Before tools/edits: one sentence max.
- No long methodology sections during active solving.
- On success: flag + reproducible command.
