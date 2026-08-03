---
name: ctf-pwn
description: Use for authorized pwn CTF challenges involving native binaries, memory corruption, shellcode, ROP, heap exploitation, format strings, syscall abuse, or pwntools exploit development.
compatibility: opencode
---

# CTF Pwn

## Purpose

Use this skill for binary exploitation. It structures triage, crash reproduction, primitive discovery, exploitation, and reliable pwntools output.

## Contract


## Load When

Load when an ELF/PE/native service, memory-corruption primitive, shellcode, ROP, heap, format-string, or syscall signal is present.

## Do Not Load When

Do not load for a pure algorithmic checker, static non-executable artifact, or protocol puzzle unless native exploitation becomes evidenced.

## Required Inputs

Require the binary/service, architecture, protections, libc/loader or container context, input surface, and current crash/primitive evidence.

## First Safe Action

Check the prepared lab or challenge container, fingerprint the binary, and reproduce one bounded baseline interaction before exploit construction.

## Dispatch / Handoff

Dispatch to the smallest matching PWN reference/leaf skill. Return a confirmed primitive and substrate facts to `ctf-closure-gate`, or pivot with the failed discriminator.

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

## Docker Lab Stability Doctrine

For every fresh PWN branch, Docker/runtime substrate selection is mandatory early evidence:

1. Check the prepared environment before runtime-sensitive tests: run `ctf-env-check category=pwn` and, when tool health is uncertain, `ctf-pwn-check-env` with `basic` or `full`.
2. Inventory challenge runtime artifacts: Dockerfile/compose, libc, loader, architecture, seccomp/sandbox hints, remote host/port, and provided run script.
3. Prefer challenge Docker/compose when present and runnable. Otherwise select one prepared pwnlab image matching the target: default `pwnlab:general-ubuntu22.04`, older/newer Ubuntu or Debian for libc alignment, Alpine for musl, multiarch images for non-native arch, heavy only for symbolic/emulation/fuzzing needs.
4. Record a substrate lock before exploit iteration: active image/service, `/work` mount, command runner, why this substrate matches the target, and what condition would unlock it.
5. Keep crash probes, gdb, pwntools scripts, libc/ld experiments, heap grooming, seccomp/ORW, and local closure tests inside the locked Docker lab. Do not bounce between host, WSL, and Docker because of shell quoting or a missing convenience command.
6. Switch to host only for cheap read-only triage that is already available there, or when Docker lacks a required host-only device/GUI/hardware feature. Switch to remote only after local/container proof or when the challenge is genuinely remote-only.
7. Before any substrate switch, write: `Switching substrate because: <current substrate blocker>; <new substrate evidence/goal>`.

## Workflow

1. Check Docker lab readiness and lock the runtime substrate before exploit iteration.
   - Run `ctf-env-check category=pwn` / `ctf-pwn-check-env` unless fresh equivalent evidence exists.
   - Prefer challenge Docker/compose, otherwise the closest prepared pwnlab image.
   - Record the selected image/service, `/work` mount, and unlock condition.
2. Triage with `file`, `checksec`, `strings`, `readelf`, and source review if available.
   - On Windows for Linux ELF targets, if host ELF tooling is incomplete, prefer `ctf-pwn-analyze` / delegated `ctf-binary-probe` container fallback output over host `<failed: ENOENT>` results.
3. Run the binary locally inside the locked Docker lab and document normal protocol.
4. Reproduce a crash with controlled input inside the locked lab.
5. Determine offset and control primitive.
6. Identify leak primitive if ASLR/PIE/libc resolution is needed.
7. Choose one exploitation route and dispatch to the matching reference before deepening.
   - If a standard closure family is already visible, compress first: exploit normal form -> canonical closure family -> minimum solve sketch.
8. Script interaction with pwntools; avoid fragile one-off shell pipes.
9. Test locally under the same Docker/libc conditions when possible.
10. Only then adapt to remote host/port.

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

If the solve becomes branchy, keep the heavy doctrine in references and let `ctf-expert` own route control while the `ctf-pwn` agent owns PWN-specific phase tracking and closure pressure.

## Flag Handling

Use `ctf-common/references/flag-identification-rules.md` for every recovered string. Keep `untrusted_hint`, `flag_candidate`, and `oracle-verified` separate. Strict `prefix{payload}` candidates are not final success by themselves; bare MD5/SHA-256 values require explicit flag-file or flag-helper context. Preserve `source`, `origin`, and `context`, and write `agent_flag.txt` only after an independent exact/file/service oracle verifies the value.
## Stop Conditions

Stop or ask when required binaries/libc are missing, remote service is unavailable, exploit reliability is too low to verify, or an operation would attack out-of-scope infrastructure.

## When to Pivot

- If the target is not actually native-binary or memory-corruption shaped, hand off to `ctf-rev`, `ctf-web`, or `ctf-misc` based on the dominant evidence.
- If the branch becomes mostly protocol/client state rather than exploitation, hand off to `ctf-misc`.
- If the path is now mathematical/encoding recovery instead of binary exploitation, hand off to `ctf-crypto`.
- If the key blockers are artifact extraction or preserved evidence handling, hand off to `ctf-forensics`.
