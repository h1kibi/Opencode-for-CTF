# PWN Solve Notes

Use for non-trivial PWN challenges that need rollback, remote adaptation, or multi-stage exploit tracking. Keep secrets sanitized.

## Target Inventory

| Field | Value |
|---|---|
| challenge |  |
| binary |  |
| libc |  |
| loader |  |
| Dockerfile / compose |  |
| source |  |
| remote |  |
| flag format |  |
| current phase | TRIAGE / PRIMITIVE_CONFIRMED / CONTROL_CONFIRMED / CALIBRATION / CHAIN_BUILD / LOCAL_PROOF / REMOTE_ADAPT / POST_EXPLOIT / FLAG_VERIFY |
| current bottleneck | BUG_FAMILY_DISCRIMINATION / PRIMITIVE_LADDER / MITIGATION_BRANCHING / HEAP_REDUCTION / REMOTE_DIVERGENCE / CLOSURE_PATH |
| primary route |  |
| closure owner | source / execution / exfil / final closure path |
| current family count | family name + attempts |
| orthogonal closure hypothesis |  |

## PWN Environment Lock

Use this before deep exploit work on Linux ELF PWN, especially on Windows. Lock one main substrate; do not switch for quoting failures.

| Field | Value |
|---|---|
| active substrate | SUBSTRATE_DOCKER / SUBSTRATE_WSL / SUBSTRATE_WINDOWS_PS |
| runtime owner | challenge-docker / pwnlab-docker / fallback-wsl |
| image |  |
| compose service / profile |  |
| mount | ./:/work |
| workdir | /work |
| binary path inside substrate |  |
| libc / ld path inside substrate |  |
| tool health | file/readelf/objdump/nm/strings/gdb/python3/pwntools/checksec |
| unlock condition |  |

Rules:
- Challenge Docker/compose is preferred when present and runtime fidelity matters.
- Fixed pwnlab Docker is the default analysis container when no challenge runtime exists.
- WSL is a fallback only after Docker is unavailable, blocked, or explicitly ruled out.
- Use `ctf-pwn-docker-runner` / `ctf-pwn-wsl-runner` for complex shell logic instead of switching substrates.


## Protection Summary

| Arch | Bits | NX | PIE | Canary | RELRO | Stripped | Seccomp | libc version |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## Protocol / Input Surface

| Surface | Parser / State | Controlled bytes | Oracle | Notes |
|---|---|---|---|---|
| stdin / argv / menu / socket / file |  |  | crash / leak / output / flag |  |

## PWN Constraint Equation

| Input Surface | Parser / State | Memory Object | Bug Class | Control / Leak Oracle | Mitigations | Desired Primitive |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## Primitive Ladder

- [ ] Input reaches parser.
- [ ] Crash or controlled behavior reproduced.
- [ ] Offset/control proof measured.
- [ ] Leak primitive established if needed.
- [ ] Mitigation bypass calculated.
- [ ] Write/control-flow primitive reliable.
- [ ] Final win/read-flag path verified.

## Route Lock Card

Fill this immediately after any confirmed high-value primitive: stale pointer/view, UAF, type confusion, arbitrary length, addrof/fakeobj, arbitrary read/write, controllable path, output-path hijack, ret2win, ORW, or stable leak-to-control.

| Field | Value |
|---|---|
| primitive |  |
| why high value |  |
| route owner |  |
| shortest closure hypothesis |  |
| confirm evidence |  |
| falsify conditions |  |
| next 3 probes only |  |

Rules:
- Confirmed primitive > confirmed source sink > reproducible anomaly > author-intent clue.
- Do not abandon this route for leftover scripts, suspicious helper names, challenge hints, or patch-looking functions until falsified.
- Normal route switch requires three focused falsify probes or one decisive source/runtime proof.
- Closure must grow from the primitive: stabilize -> identify affected object/consumer -> upgrade/read/write -> close.

## Exploit Normal Form

Compress the branch here as soon as a high-value primitive exists.

| Field | Value |
|---|---|
| control | saved_rip / saved_rbp / stack_pivot / aar / aaw |
| code_addr | fixed / pie |
| writable_memory | none / stack / heap / bss / global |
| replay | yes / no |
| leak_surface | puts_got / printf_got / show_path / fmt_read / none |
| closure_template | ret2win / pivot+bss / leak+replay / orw / shell / data_only |
| reference_class | fake-stack leak / ret2libc replay / format read-first / ORW seccomp / heap stale overwrite / data-only hijack |

Rules:
- Once this card is stable, new probes should refine/falsify it rather than restart free-form explanation.
- If it already points to a standard exploit family, that family is the default closure candidate until a real oracle disproves it.

## Minimum Solve Sketch

Answer this once after primitive lock:

> If only 20-40 lines of solve were allowed, what is the shortest plausible exploit skeleton now?

| Field | Value |
|---|---|
| shortest sketch |  |
| why it is sufficient / not yet sufficient |  |
| missing proof if any |  |

If the sketch is already writable, the branch is in closure mode and should not keep doing large-scale semantic recovery unless that work shortens or falsifies the sketch.

## Canonical Closure Ranking

| Rank | Template | Falsified? | Why live / why demoted |
|---|---|---|---|
| 1 | ret2win / direct close | yes / no |  |
| 2 | pivot -> writable static/global | yes / no |  |
| 3 | single leak -> replay | yes / no |  |
| 4 | ORW / direct read path | yes / no |  |
| 5 | shell | yes / no |  |

If a higher-priority canonical template is still live, do not promote a lower-priority or more stateful route without a concrete falsifier.

## Crash / Control

| Item | Value | Evidence |
|---|---|---|
| crash input |  |  |
| cyclic offset |  |  |
| controlled register | RIP / EIP / PC / none |  |
| bad chars / truncation |  |  |
| stack alignment needed | yes / no / unknown |  |

## Leak Ledger

| Leak | Raw form | Class | Offset | Base | Sanity | Use |
|---|---|---|---|---|---|---|
|  | sanitized | stack / heap / PIE / libc / ld / unknown |  |  | aligned / range / repeated |  |

Rules:
- Unknown-class leaks cannot drive final ROP.
- Classify every pointer before base math.
- Record repeated stability for remote-relevant leaks.
- Mark which leaks are stable, unstable, or forbidden for final math.

## Gadget / Symbol Ledger

| Name | Address / Offset | Source | Assumption |
|---|---|---|---|
| win / print_flag |  | symbol / ROPgadget / source |  |
| pop rdi / pop rsi / pop rdx / pop rax |  |  |  |
| syscall / ret |  |  |  |
| system / /bin/sh / exit |  | libc |  |
| writable buffer |  | .bss / heap / stack |  |

## Route Queue

| Rank | Route | Evidence+ | Evidence- | Next Probe | Kill Rule |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

Family counting rule:
- Changes that only alter gadget addresses, one_gadget candidates, shell spellings, padding, minor send/sendline behavior, flag-path guesses, or same-closure syscall/path aliases are still the same family unless the primitive, oracle, mitigation bypass, or closure owner changes materially.


## Heap Menu State

| Operation | Inputs | Index Rules | Size Rules | Lifetime | Oracle |
|---|---|---|---|---|---|
| add |  |  |  |  |  |
| delete |  |  |  |  |  |
| edit |  |  |  |  |  |
| show |  |  |  |  |  |

## Seccomp / ORW Plan

| Field | Value |
|---|---|
| syscall ABI | amd64 / i386 / arm64 / unknown |
| allowed syscalls |  |
| path address |  |
| buffer address |  |
| output fd/socket |  |
| selected chain | open/read/write / openat/read/write / sendfile / other |

## Runtime Confidence

| Runtime | Confidence | Notes |
|---|---:|---|
| local-native | 0-3 |  |
| docker-challenge or pwnlab | 0-3 |  |
| remote-equivalence | 0-3 |  |


## Exploit Stages

| Stage | Payload / Action | Expected Oracle | Actual Result |
|---|---|---|---|
| 1 | leak / crash / control |  |  |
| 2 | base calc / pivot |  |  |
| 3 | final chain | flag / shell / file read |  |

## Compact Closure Tuple

| Current Primitive | Primitive Role | Shortest Closure Path | Why Shorter Than Alternatives | Next Closure Probe | Downgrade Trigger |
|---|---|---|---|---|---|
|  | source / execution / exfil / closure_owner |  |  |  |  |

## Primitive Class Split

| Field | Value |
|---|---|
| current closure primitive |  |
| current bridge primitive if any |  |
| why bridge is required or why it should be demoted |  |

Bridge primitives like “read one more chunk / replay once more / rewrite another buffer” do not outrank the shortest live closure primitive unless required by the selected canonical template.

## Over-Complexity Warning Panel

| Warning | Present? | Evidence | Action |
|---|---|---|---|
| local semantic recovery continues after canonical closure is visible | yes / no |  | compress / rerank |
| two rounds added explanation but did not shorten exploit chain | yes / no |  | rerank |
| a higher-priority canonical template is still live | yes / no |  | demote lower route |
| “one more confirmation” became the default move | yes / no |  | close now / falsify |

## Adjacency Audit

Use this whenever attacker-controlled writes touch global, `.bss`, heap state, FILE-like objects, parser buffers, or other long-lived memory.

| Target Object | Previous Adjacent Object | Next Adjacent Object | Later Consumer | Existing Output Path to Hijack? | Shorter Than Shell/ROP/File-Write? |
|---|---|---|---|---|---|
|  |  |  |  | yes / no / unknown | yes / no / unknown |

Rules:
- Do not assume the first strong primitive is the closure owner.
- If the current closure family fails twice without the expected behavior differential, demote it and re-rank.
- Prefer existing `puts`/`printf`/`write`/`send` secret-bearing paths over building a new shell path when shorter and more stable.


## Remote Drift Checklist

- [ ] Prompt synchronization checked.
- [ ] Newline/null/truncation checked.
- [ ] Timeout/buffering checked.
- [ ] Leak parser works on remote bytes.
- [ ] libc/ld match checked.
- [ ] Stack alignment checked.
- [ ] one_gadget constraints checked if used.
- [ ] Forking/ASLR model checked.
- [ ] Seccomp/container difference checked.
- [ ] Flag path/environment checked.

## Final Verification

| Field | Value |
|---|---|
| local_success | true / false |
| remote_success | true / false / untested |
| flag_detected | true / false |
| shell_detected | true / false |
| crash | true / false |
| timeout | true / false |
| exploit file | exploit.py / solve.py / work/last_attempt.py |
| command |  |

## Notes for Retro

- wrong branch:
- final primitive:
- final closure:
- remote drift:
- pattern feedback:
- reference to update:
