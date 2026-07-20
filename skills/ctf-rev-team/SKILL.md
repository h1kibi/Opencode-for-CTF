---
name: ctf-rev-team
description: Use inside ctf-expert for complex reverse engineering challenges that need orthogonal team fanout, public evidence memory, local knowledge recall, and shortest-closure control.
compatibility: opencode
---

# CTF Rev Team Mode

## Purpose

Use this skill when `ctf-expert` is the lead for a complex reverse engineering challenge and the bottleneck is branch selection, evidence bandwidth, or competing solver routes rather than a single obvious checker.

Team Mode expands early evidence bandwidth; it must not expand speculation. `ctf-expert` remains the lead, owns public memory, merges results, ranks top-3 routes, selects exactly one next probe, and performs final verification.

## Trigger Gate

Enter Rev Team Mode when one strong trigger is present, or two weak triggers combine with stalled single-agent progress.

Strong triggers:

- packed, self-decrypting, missing sections, or post-unpack code suspected
- Unicorn, Qiling, Capstone, VM, bytecode dispatcher, or generated payload signals
- APK/JNI/assets/reflection/native `.so` bridge evidence
- multiple files, layers, languages, architectures, or resources
- static and dynamic observations conflict
- at least three plausible routes compete: checker slice, runtime dump, replay, z3, angr, VM lifter, mobile bridge
- one agent has not compressed the route into one main line after 10-15 minutes

Do not enter Team Mode for plaintext flags, one-function checkers, obvious XOR/base64/table transforms, small confirmed z3 constraints, or a unique route that only needs `solve.py`.

## Team Shapes

Default team size is 2-3 members; hard maximum is 4 unless attachments are fully independent.

- Static/checker analyst: file type, arch, sections, strings/imports, success/failure xrefs, checker boundary, constants/tables, IDA/ReVa/slice evidence.
- Runtime/unpack/emulation analyst: packer, self-decrypt, live dump marker/range, anti-debug/anti-VM, Unicorn/Qiling/Capstone/replay feasibility.
- Knowledge analyst: `ctf-pattern-card-search category="reverse"`, `ctf-skill-repo-search category="reverse"`, `ctf-lesson-search`, anti-patterns, first probe pressure.
- Oracle/verifier reviewer: overtrusted assumptions, semantic mismatch, duplicated work, route demotion, shortest closure candidate.

APK/JNI teams should split Java/Kotlin/assets, native/JNI `.so`, runtime/Frida bridge, and knowledge/oracle. VM/Unicorn teams should split dispatcher/opcode state, runtime dump/replay, constraints/solver, and knowledge/oracle.

## Public Memory Contract

Maintain these files under `work/ctf-evidence/<challenge-slug>/` when practical:

- `rev-team-memory.json`: structured public memory.
- `rev-team-summary.md`: human-readable merge summary.

Only write these classes:

- confirmed facts: file type, architecture, packer, entry/checker address, input length, success/failure strings, payload base/hash, verified constants
- high-value signals: `UPX0/UPX1`, `uc_open`, `uc_mem_map`, `uc_emu_start`, `JNI_OnLoad`, `RegisterNatives`, bytecode dispatcher, S-box/table, success/failure xref
- falsified routes: route, why closed, evidence, timestamp
- closure candidates: direct flag, checker extraction, runtime dump, replay, transform inversion, z3, angr, VM lifter, patch-as-verification
- knowledge hits: query, source, hit, used/not used, route effect

Do not write broad guesses, long decompiler excerpts, duplicate strings, route ideas without an oracle, or raw unbounded tool output.

## Team Result Contract

Every member returns only:

```text
TEAM_RESULT:
- member:
- scope:
- confirmed_facts:
- high_value_signals:
- candidate_routes:
- falsified_routes:
- artifacts:
- risk:
- recommended_next_probe:
```

Limits per result:

- at most 10 confirmed facts
- at most 5 high-value signals
- at most 3 candidate routes
- at most 1 recommended next probe

The lead merges only high-confidence facts, useful signals, falsified routes, closure candidates, knowledge hits, and one selected next probe.

## Knowledge Gate

Before promoting any complex rev route, run local recall after meaningful triage:

1. `ctf-pattern-card-search` with `category="reverse"`
2. `ctf-skill-repo-search` with `category="reverse"`
3. `ctf-lesson-search` with evidence-based query
4. `ctf-pattern-to-hypothesis` only for the selected card

Trigger recall after triage reveals clear signals, route fanout exceeds two, same-family attempts fail twice, VM/Unicorn/self-decrypt/anti-debug appears, or a complex route is about to be promoted.

## Rev Closure Priority Ladder

Rank closure candidates in this order unless live evidence overrides it:

1. Direct flag or plaintext: verify once and stop.
2. Direct checker extraction: constants/transform to `solve.py`.
3. Runtime dump: dump post-unpack/self-decrypted payload before reversing the unpacker.
4. Unicorn/Qiling replay: recover arch/mode/map/register/start/end and replay.
5. Simple transform inversion: XOR/add/rol/table/base/base64/custom encoder.
6. Z3 constraints: only after constraints, width, and input domain are confirmed.
7. angr symbolic execution: only with bounded input and reliable find/avoid.
8. VM lifter/full emulator: only after dispatcher and bytecode semantics are proven.
9. Patch-based bypass: verification or last resort, not primary solve.

A more complex route may be promoted only when the shorter route is falsified, the complex route is provably cheaper, strong evidence already exists, or the target naturally requires that family.

## Anti-Overhead Rules

- Team tasks must be orthogonal; do not assign multiple members to read the same `main`/checker without distinct scope.
- After merging a team round, the lead may select exactly one next probe.
- Stop team fanout after two rounds with no new confirmed facts, high-value signals, falsified routes, or closure candidates.
- Prefer public memory updates over long narration.
- Prefer the shortest verified solver path over complete reverse-engineering coverage.
