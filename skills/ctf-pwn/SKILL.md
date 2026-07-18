---
name: ctf-pwn
description: Use for authorized pwn CTF challenges involving native binaries, memory corruption, shellcode, ROP, heap exploitation, format strings, syscall abuse, or pwntools exploit development.
compatibility: opencode
---

# CTF Pwn

## Purpose

Use this skill for binary exploitation. It structures triage, crash reproduction, primitive discovery, exploitation, and reliable pwntools output.

## Contract

- Start reference navigation from `references/REFERENCE_INDEX.md` when multiple PWN subfamilies are plausible.
- Always combine this with `ctf-terminal` for real-output command discipline.
- Prefer the smallest matching route template or reference instead of expanding doctrine inline.
- Keep `notes.md` focused on the current primitive, substrate state, and next shortest verification step.

Keep this skill thin. Use it for PWN routing, evidence gates, and reference dispatch. Detailed route trees, calibration doctrine, closure variants, runtime-substrate rules, and version-specific exploitation pressure belong in `references/*.md`, `../../../knowledge/pwn/**/*.md`, and the PWN agents.

Start reference navigation from `references/REFERENCE_INDEX.md` when multiple PWN subfamilies are plausible. For fast-lane autonomy, fast-versus-rigorous boundary questions, helper selection, bundled-libc, exact-read, fake-stdout, `setcontext+53`, seccomp, and anti-pattern questions, prefer `references/pwn-fast-autonomy.md`, `references/pwn-mode-boundary.md`, `references/pwn-runtime-trigger-matrix.md`, and `references/runtime-closure-index.md` before broader route docs. Prefer the distilled runtime-aware cards under `../../../knowledge/pwn/` before opening long references when the next question is about bundled libc, glibc-version routing, exact read contracts, or closure-first decisions.

When a strong primitive exists but the branch is drifting into more local explanation instead of a shorter exploit, open `references/pwn-anti-overcomplication.md` before expanding the route.

## Fast Entry Contract

If the branch looks like PWN, the first job is not to solve it; the first job is to classify it into one of these buckets:

- `ret2win` / `ret2plt`
- `ret2libc`
- `fmt`
- `shellcode` / `orw`
- `heap-simple` (`uaf`, `double-free`, one stable stale-pointer path)
- `stack-pivot`
- `ret2csu` / `srop`

If the bucket is obvious, dispatch immediately to the matching template or reference instead of expanding the prompt.

## Scope

Use only on provided challenge binaries, local services, Dockerized tasks, or explicitly authorized CTF endpoints.

## Inputs

Collect:

- Binary, libc, loader, Dockerfile, source if present, remote host/port if present.
- Architecture, protections, input protocol, normal behavior, and flag format.
- Whether ASLR, PIE, NX, canary, RELRO, seccomp, or sandboxing matters.

## Workflow

1. Triage with `file`, `checksec`, `strings`, `readelf`, and source review if available.
   - On Windows for Linux ELF targets, if host ELF tooling is incomplete, prefer `ctf-binary-probe` container fallback output over host `<failed: ENOENT>` results.
2. Run the binary locally and document normal protocol.
3. Reproduce a crash with controlled input.
4. Determine offset and control primitive.
5. Identify leak primitive if ASLR/PIE/libc resolution is needed.
6. Choose one exploitation route and dispatch to the matching reference before deepening.
   - If a standard closure family is already visible, compress first: exploit normal form -> canonical closure family -> minimum solve sketch.
7. Script interaction with pwntools; avoid fragile one-off shell pipes.
8. Test locally under the same Docker/libc conditions when possible.
9. Only then adapt to remote host/port.

Windows/Linux-substrate note:

- If `ctf-pwn-runner` reports `host_execution_blocked`, treat that as a valid guardrail, not a failure to brute-force through. Move to `ctf-pwn-docker-runner` or the approved WSL fallback.
- If long Docker transcript output is truncated, continue from `ctf-pwn-docker-runner` `output_path` rather than rebuilding the same probe from memory.
- If local pipe and remote socket behavior diverge around fixed-size reads, padding, or menu pacing, use `ctf-pwn-io-diff-check` before changing exploit family.

## Reference Dispatch

Load the smallest matching reference set instead of keeping the whole exploit tree in this skill:

- direct BOF / ret2win / ret2libc -> `references/ret2win-ret2libc.md`, `references/pwn-route-matrix.md`
- format string -> `references/format-string.md`, `references/leak-to-primitive-ladder.md`
- calibration / parser side effects / near-success -> `references/exploit-calibration.md`, `references/pwn-near-success-classifier.md`
- heap / tcache / allocator versioning -> `references/heap-family-first-questions.md`, `references/heap-version-route-matrix.md`, `references/heap-tcache.md`
- UAF / stale reference / repeated allocator actions -> `references/heap-transaction-reduction.md`, `references/heap-uaf-safe-linking.md`
- stack pivot / partial overwrite / small overflow -> `references/pwn-route-matrix.md`, `references/pwn-fallback-matrix.md`
- ret2csu / SROP / syscall-heavy routes -> `references/pwn-route-matrix.md`, `references/seccomp-orw.md`, `references/seccomp-sandbox-closure.md`
- C++ inventory / equipment / description / wrapper-object UAF -> `references/cxx-object-uaf.md`
- data-only / adjacency / hookless closure -> `references/pwn-output-hijack-closure.md`, `references/modern-fsop-cpp-dataonly.md`, `references/partial-control-to-arbitrary-write-read.md`
- seccomp / syscall / ORW -> `references/seccomp-orw.md`, `references/seccomp-sandbox-closure.md`
- runtime alignment / remote drift -> `references/pwn-runtime-substrate-lock.md`, `references/remote-local-divergence.md`, `references/glibc-version-uncertainty-routing.md`
- fixed-length read / local-pipe vs remote-socket framing drift -> `references/remote-local-divergence.md` plus `ctf-pwn-io-diff-check`
- specialized families -> `references/kernel-pwn.md`, `references/qemu-device-pwn.md`, `references/browser-jit-vm-pwn.md`, `references/pwn-race.md`

## Quick Route Policy

Keep this skill thin. Use the following rule instead of carrying large route tables here:

- For fast route selection, read `references/quick-reference.md`.
- For family choice and stop rules, read `references/pwn-route-matrix.md`.
- For unstable/near-success branches, read `references/exploit-calibration.md` and `references/pwn-near-success-classifier.md`.
- For heap, decide primitive first, then read the heap references.

The skill should classify and dispatch, not duplicate the whole exploit doctrine.

## Tool Discipline

- Use scripted `gdb` or batch commands when possible.
- Use `xxd` or Python for binary output parsing.
- Keep payload generation deterministic.
- Record offsets, gadgets, leaks, base addresses, and assumptions in `notes.md`.
- Do not assume a crash means instruction-pointer control; prove it.
- Prefer the dedicated PWN macro tools before freehand command sequences when they answer the current question directly.

Required evidence includes:

- Protection summary.
- Crash transcript or debugger state.
- Offset calculation.
- Leak calculation if used.
- Local exploit success or clear explanation why only remote can verify.
- Final flag output from the program or service.

## Output Contract

Produce `exploit.py` or `solve.py` with:

- `LOCAL`/`REMOTE` mode or clear target variables.
- Binary/libc paths as variables.
- Comments for offsets and important gadgets.
- Final flag extraction logic.

When speed matters, start from the smallest matching route template instead of hand-rolling the whole exploit:

- `templates/pwn_fast_ret2win.py`
- `templates/pwn_fast_ret2libc.py`
- `templates/pwn_fast_fmt.py`
- `templates/pwn_fast_shellcode.py`
- `templates/pwn_fast_heap.py`
- `templates/pwn_fast_heap_uaf.py`
- `templates/pwn_fast_heap_df.py`
- `templates/pwn_fast_orw.py`
- `templates/pwn_fast_ret2csu.py`
- `templates/pwn_fast_srop.py`
- `templates/pwn_fast_stack_pivot.py`

If the solve becomes branchy, keep the heavy doctrine in references and let `ctf-rigorous` / `ctf-pwn` agent prompts own phase tracking and closure pressure.

## Stop Conditions

Stop or ask when required binaries/libc are missing, remote service is unavailable, exploit reliability is too low to verify, or an operation would attack out-of-scope infrastructure.

## When to Pivot

- If the target is not actually native-binary or memory-corruption shaped, hand off to `ctf-rev`, `ctf-web`, or `ctf-misc` based on the dominant evidence.
- If the branch becomes mostly protocol/client state rather than exploitation, hand off to `ctf-misc`.
- If the path is now mathematical/encoding recovery instead of binary exploitation, hand off to `ctf-crypto`.
- If the key blockers are artifact extraction or preserved evidence handling, hand off to `ctf-forensics`.
