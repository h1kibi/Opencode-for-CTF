---
description: Start rigorous Rev Team Mode with public memory and shortest-closure control
agent: ctf-master
subtask: false
---

Start a complex reverse-engineering team workflow.

Challenge/target:
$ARGUMENTS

Use `ctf-common`, `ctf-decision-engine`, `ctf-rev`, and `ctf-rev-team` skills.

## Gate

First run the smallest useful intake tool, such as `ctf-one-shot-triage`, `ctf-binary-probe`, `ctf-elf-slice`, `ctf-rev-pe-slice`, `ctf-file-triage`, or `ctf-safe-extract`.

Enter Rev Team Mode only when the evidence shows complex reverse-engineering fanout: packed/self-decrypting code, VM/Unicorn/Qiling/Capstone clues, APK/JNI/assets/reflection/native bridge, multiple files/layers/languages/architectures, static-vs-dynamic conflict, or at least three competing rev routes.

## Public Memory

Initialize or refresh:

- `work/ctf-evidence/<challenge-slug>/rev-team-memory.json`
- `work/ctf-evidence/<challenge-slug>/rev-team-summary.md`

Write only confirmed facts, high-value signals, falsified routes, closure candidates, knowledge hits, team task summaries, and the selected next action.

## Team Plan

Create orthogonal tasks only:

- static/checker: file, arch, sections, strings/imports, success/failure xrefs, checker boundary, constants/tables
- runtime/unpack/emulation: packer, self-decrypt, live dump marker/range, anti-debug, Unicorn/Qiling replay feasibility
- knowledge: `ctf-pattern-card-search category="reverse"`, `ctf-skill-repo-search category="reverse"`, `ctf-lesson-search`
- oracle/verifier: overtrusted assumptions, duplicate work, shorter closure, route demotion

Each member must return `TEAM_RESULT` only. After merging, select exactly one next probe and prefer the shortest closure ladder: direct flag -> checker extraction -> runtime dump -> replay -> simple transform -> z3 -> angr -> VM lifter -> patch verification.
