# PWN Fast-Lane Benchmark Guide

This guide defines how to use `benchmarks/pwn/` to evaluate `ctf-pwn-fast` as a **simple/medium template-PWN speed lane**, not as a miniature rigorous solver.

## Purpose

`ctf-pwn-fast` should optimize for exactly three good outcomes inside the 15-minute soft budget:

1. **solve** — directly gets the flag
2. **near-closure** — shortest closure family is locked and only a narrow blocker remains
3. **clean handoff** — correctly decides the task is no longer fast-lane simple and hands off a compact restart package to `ctf-rigorous`

A benchmark pass is not only “did it solve.” It is also “did it avoid wrong-complexity drift” and “did it hand off with enough closure context when it should stop.”

## What fast-lane is supposed to be good at

Typical fast-lane scenarios:

- direct BOF / ret2win
- ret2libc starter
- leak-first format string
- simple heap/menu with one short primitive-to-closure path
- seccomp/static starter where direct ORW/file-read is the shortest path
- post-exploit near-success where one closure-first probe should settle the branch

Typical non-fast-lane scenarios:

- allocator/glibc-version-gated heap reasoning
- repeated gdb-dependent calibration without closure movement
- unstable or ambiguous leak/base classification
- complex object-graph / FILE-internals / cross-round slot-stability reasoning
- multiple serious exploit families still alive after the opening budget

## Benchmark success criteria

For a `ctf-pwn-fast` run, evaluate these in order:

### 1. Opening quality
- `ctf-binary-probe` is used early
- when bundled `libc.so.6` / `ld` exists, `ctf-pwn-libc-runtime-doctor` is used before validating heap/overlap/tcache behavior on a default mismatched base
- the route family is identified quickly
- host/Docker substrate choice is justified
- exploit scaffolding starts early when the family is obvious

### 2. Closure compression quality
- once control, stable leak, or a useful primitive exists, the branch moves to a shortest-closure model
- the next probes serve the current shortest closure family
- the branch prefers direct read / leak-to-read / data-only closure before heavier control-flow work unless the heavier route is clearly shorter

### 3. Drift control quality
- same-family payload roulette is avoided
- exact-length or mixed menu/raw read contracts are recognized early enough to justify `ctf-pwn-menu-contract-probe` or an equivalent helper lock
- wrong-complexity signals trigger rerank or handoff
- fast mode does not linger after the task stops being simple

### 4. Handoff quality
When unsolved, the run should still pass if it produces:
- confirmed primitive or strongest non-proof signal
- selected fast route
- shortest closure family
- exact blocker
- best next rigorous probe
- oracle/falsify condition for that next probe
- same-family attempts already spent

## Reading benchmark results

Use:

```powershell
node scripts/check-pwn-benchmarks.ts benchmarks/pwn/<case>
```

The benchmark checker is intentionally output-driven. It does not prove exploit correctness by itself; it checks whether the run shows the intended fast-lane behavior.

Important rule classes currently covered include:
- early binary probe
- ret2win stays fast-lane
- format-string leak-first discipline
- control -> calibration
- primitive compressed into closure
- read-closure preferred before clever heavy writes
- heap UAF enters reduction mode
- leak classification before heap math
- C++ inventory object model before closure drift
- near-success classified before drift
- seccomp routed to ORW/file-read
- heap route version-gated
- remote drift checked before roulette
- handoff includes closure and next-probe quality
- wrong-complexity drift acknowledged

## Recommended benchmark interpretation

A failure does **not** always mean the exploit route was impossible. It often means one of these:

- the branch kept proving capability instead of shortening the flag path
- the agent chose a heavier route while a shorter closure family was still alive
- the agent stayed in fast mode too long instead of handing off
- the agent handed off without enough closure context

## Expected benchmark output artifacts

A useful benchmark directory or replay directory should contain at least some of:
- `notes.md`
- `exploit.py` or `solve.py`
- `final-verification.txt`
- `work/ctf-evidence/<slug>/...`
- handoff or snapshot artifacts when unsolved

## Current benchmark gaps to fill

The current `benchmarks/pwn/` cases cover:
- ret2win
- fmtstr leak/write
- calibration after control
- near-success closure
- remote drift
- seccomp ORW
- heap/tcache
- parser-side-effect overflow
- heap UAF reduction
- C++ inventory UAF object modeling
- safe-linking leak classification

Recommended next additions for better fast-lane coverage:

1. **fmt-read-closure-shortest**
   - arbitrary read is available early
   - benchmark should prefer GOT/libc/read-closure over heavier control-flow drift

2. **near-closure-template-lock**
   - exploit skeleton exists and only one narrow blocker remains
   - benchmark should treat this as a valid fast-mode success state even if the flag is not yet reproduced in the log

3. **early-handoff-non-fast-lane**
   - multiple serious exploit families remain alive or glibc/object reasoning dominates
   - benchmark should reward fast, high-quality escalation instead of punishing lack of solve

4. **bundled-libc-hard-gate**
   - bundled `libc.so.6` or `ld` is present
   - benchmark should require a runtime-doctor/substrate-gate step before heap or overlap validation proceeds on a default pwnlab base

5. **menu-read-contract-lock**
   - exact-length `read(size+1)` or mixed menu/raw phase exists
   - benchmark should reward early helper locking instead of repeated send/sendline drift

6. **dead-stack-secret-promote-long-lived-read**
   - stack copy is cleared/overwritten
   - benchmark should reward promotion of heap/global/FILE-backed closure routes

For rigorous heap/C++ coverage beyond fast-lane, the current added cases already exercise:
- heap reduction entry
- object-model-first UAF reasoning
- leak classification before safe-linking-era math

## Authoring new PWN fast-lane cases

For each new benchmark case, keep `expected_behavior.md` compact and reusable:

- Scenario
- Agent Should
- Agent Should Not
- Success Signal

Do not encode one challenge writeup. Encode the reusable fast-lane behavior you want to preserve.

## Rule of thumb

If a benchmark requires `ctf-pwn-fast` to look like `ctf-rigorous`, the benchmark is probably wrong.

The purpose of this lane is:
- solve simple things quickly
- recognize when they are no longer simple
- hand off before wrong-complexity drift burns contest time
