# PWN Compact State

Use this compact state for medium/hard PWN when `notes.md` is becoming large, the branch is drifting, or the solve may need a fast resume. Keep only decision-critical facts here.

## Solve Phase

| Field | Value |
|---|---|
| current phase | TRIAGE / PRIMITIVE_CONFIRMED / CONTROL_CONFIRMED / CALIBRATION / CHAIN_BUILD / LOCAL_PROOF / REMOTE_ADAPT / POST_EXPLOIT / FLAG_VERIFY |
| current bottleneck | BUG_FAMILY_DISCRIMINATION / PRIMITIVE_LADDER / MITIGATION_BRANCHING / HEAP_REDUCTION / REMOTE_DIVERGENCE / CLOSURE_PATH |
| primary route |  |
| closure owner | source / execution / exfil / final closure path |
| orthogonal closure hypothesis |  |
| current family count | family name + attempts |

## Environment Lock

| Field | Value |
|---|---|
| active substrate | SUBSTRATE_DOCKER / SUBSTRATE_WSL / SUBSTRATE_WINDOWS_PS |
| runtime owner | challenge-docker / pwnlab-docker / fallback-wsl |
| image / service / profile |  |
| mount / workdir | ./:/work / /work |
| tool health | file/readelf/objdump/nm/strings/gdb/python3/pwntools/checksec |
| unlock condition |  |

Do not switch substrate for quoting failures. Use the substrate runner first.

## Route Lock Card

| Field | Value |
|---|---|
| locked primitive |  |
| why high value |  |
| route owner |  |
| shortest closure hypothesis |  |
| confirm evidence |  |
| falsify conditions |  |
| next 3 probes only |  |

Confirmed primitive outranks unconfirmed patch-intent clues until falsified.

## Exploit Normal Form

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
- If this card is stable, closure work should refine/falsify it instead of reopening free-form route narration.
- If a later probe does not change this card, shorten the chain, or kill a competing family, treat it as potential drift.

## Minimum Solve Sketch

| Field | Value |
|---|---|
| shortest 20-40 line exploit sketch |  |
| why it is already sufficient / not yet sufficient |  |
| missing proof if any |  |

If this sketch is already writable, the branch is in closure mode. Do not continue broad semantic recovery unless it shortens or falsifies the sketch.

## Canonical Closure Ranking

| Rank | Template | Falsified? | Why still live / why demoted |
|---|---|---|---|
| 1 | ret2win / direct close | yes / no |  |
| 2 | pivot -> writable static/global | yes / no |  |
| 3 | single leak -> replay | yes / no |  |
| 4 | ORW / direct read path | yes / no |  |
| 5 | shell | yes / no |  |

Higher-priority live templates outrank lower-priority or more stateful closure paths unless concretely falsified.

## Protocol Facts

| Field | Value |
|---|---|
| input model | argv / stdin / menu / socket / file |
| parser side effects | tokenized / copied / joined / filtered / transformed / none |
| truncation | newline / null / length field / unknown |
| delimiter behavior |  |
| pacing / prompt sync |  |

## Control Facts

| Field | Value |
|---|---|
| crash reproduced | yes / no |
| exact RIP/EIP offset |  |
| control width | partial / full / unknown |
| preserve region |  |
| stack alignment needed | yes / no / unknown |
| minimum local closure proof | ret2win / one read / one write / one syscall / unknown |

## Leak Facts

| Field | Value |
|---|---|
| stable leaks |  |
| unstable leaks |  |
| classified bases | stack / heap / pie / libc / ld |
| forbidden unknown leaks | list any leak that must not drive final math |
| remote leak shape | same / different / unknown |

## Runtime Facts

| Runtime | Confidence | Notes |
|---|---:|---|
| local-native | 0-3 |  |
| docker-challenge or pwnlab | 0-3 |  |
| remote-equivalence | 0-3 |  |

## Current Closure Path

| Field | Value |
|---|---|
| current primitive |  |
| primitive role | source / execution / exfil / closure_owner |
| shortest closure path |  |
| why shorter than alternatives |  |
| next closure probe |  |
| kill / downgrade trigger |  |
| behavior-mismatch demotion trigger | two failed same-family closure probes without expected differential |

## Primitive Class Split

| Field | Value |
|---|---|
| current closure primitive |  |
| current bridge primitive if any |  |
| why bridge is required or why it should be demoted |  |

Closure primitive outranks bridge primitive by default.

## Over-Complexity Warnings

| Warning | Present? | Evidence | Action |
|---|---|---|---|
| local semantic recovery continues after canonical closure is visible | yes / no |  | compress / rerank |
| two rounds added explanation but did not shorten exploit chain | yes / no |  | rerank |
| a higher-priority canonical template is still live | yes / no |  | demote lower route |
| “one more confirmation” became the default move | yes / no |  | close now / falsify |

## Fast-Handoff / Suspend Package

| Field | Value |
|---|---|
| target/runtime summary |  |
| binary/libc/ld/docker inventory |  |
| mitigation summary |  |
| protocol/input model |  |
| selected route and why |  |
| attempted payloads / same-family count |  |
| exact blocker |  |
| strongest proven primitive or unresolved signal |  |
| stable leaks / forbidden unknown leaks |  |
| exploit artifact path / last-good command |  |
| last local output / last remote output |  |
| active substrate |  |
| best next rigorous one-variable probe | probe / oracle / confirm / falsify |
| why no longer simple / why suspended |  |

## Adjacency Audit Summary

| Field | Value |
|---|---|
| target object |  |
| previous adjacent object |  |
| next adjacent object |  |
| later consumer |  |
| existing output path to hijack | yes / no / unknown |
| shorter than shell/ROP/file-write | yes / no / unknown |
| decision | pursue adjacency route / keep orthogonal / demote adjacency |

## Near-Success Snapshot

| Field | Value |
|---|---|
| post-exploit class | shell-likely-limited / one-shot-command / file-read-likely / prompt-desync / stdout-stderr-diff / none |
| last meaningful differential |  |
| next one-variable check |  |

## Experiment Ledger Snapshot

| Field | Value |
|---|---|
| last experiment packet | probe / oracle / state delta / next action |
| leak stability status | stable / unstable / unknown |
| heap/runtime delta artifact | file / note / none |
| exploit iteration owner | exploit.py / solve.py / work/last_attempt.py / none |
| continue vs suspend value | continue / suspend / handoff |

## Frozen Facts

- Facts here should survive branch switches.
- Remove speculative notes once falsified.
- If a fact changes route, mitigation assumptions, or closure path, mirror it back into `notes.md`.
- Do not let a confirmed strong primitive monopolize the compact state unless it remains the shortest stable closure owner.
- When output-path hijack, path/length/state overwrite, or other data-only corruption is plausible, preserve it as the orthogonal closure hypothesis until behavior clearly demotes it.
