# CTF Agent OS Overview

This document summarizes the current structure of the CTF solving system under `C:\Users\Administrator\.config\opencode`.

It is not a roadmap. It describes the system as it exists now after the controller, evidence, QA, and regression upgrades.

## Mission

The system is designed to solve authorized CTF challenges with:

- fast entry for easy or time-sensitive tasks
- rigorous control for branchy or hard tasks
- domain specialists for Web, PWN, Rev, Crypto, Forensics, and Misc
- structured evidence artifacts for handoff and resume
- executable QA and regression checks to prevent discipline drift

## Top-Level Layers

The current architecture is best understood as six layers.

### 1. Entry Layer

Primary work agents:

- `agents/daily.md`
- `agents/ctf-master.md`
- `agents/researcher.md`

Execution subagent:

- `agents/ctf-fast.md`

Roles:

- `daily`: normal development and non-CTF work
- `ctf-master`: controller for route, owner, probe, closure, resume, and final verification
- `researcher`: local SecKB/CVEKB maintenance and indexing workflow
- `ctf-fast`: intuition-first, low-ceremony, short-budget fast execution arm under `ctf-master`

### 2. Specialist Layer

Domain execution agents:

- `agents/ctf-web.md`
- `agents/ctf-pwn.md`
- `agents/ctf-rev.md`
- `agents/ctf-crypto.md`
- `agents/ctf-forensics.md`
- `agents/ctf-misc.md`

Auxiliary agents:

- `agents/ctf-scout.md`
- `agents/ctf-librarian.md`
- `agents/ctf-oracle.md`
- `agents/ctf-verifier.md`
- `agents/ctf-retro.md`

Boundary rule:

- specialists own domain doctrine and next domain-specific probe
- `ctf-master` owns control-plane decisions and final merge

### 3. Shared Decision Layer

Shared skills that now carry most cross-category discipline:

- `skills/ctf-common/SKILL.md`
- `skills/ctf-decision-engine/SKILL.md`
- `skills/ctf-experience-gate/SKILL.md`
- `skills/ctf-closure-gate/SKILL.md`
- `skills/ctf-ledger-discipline/SKILL.md`

What they own:

- visible output discipline
- top-3 hypothesis queue behavior
- one-variable probe contracts
- `ctf-decision-state` usage rules
- anti-drift and semantic mismatch pressure
- closure-first behavior after a confirmed primitive
- checkpoint and interruption hygiene

### 4. Evidence Runtime Layer

Canonical evidence directory:

- `work/ctf-evidence/<challenge-slug>/`

Canonical state files:

- `route.json`
- `primitive.json`
- `closure.json`

Canonical restart and handoff files:

- `resume.md`
- `handoff.md`
- `fast-handoff.md`
- `snapshot.md`

Verification files:

- `solve-output.txt`
- `final-verification.txt`

Reference:

- `docs/CTF_EVIDENCE_LAYOUT.md`

### 5. Evidence Helper Layer

Bootstrap:

- `scripts/init-ctf-evidence.ts`

Dedicated writers:

- `scripts/write-route-state.ts`
- `scripts/write-primitive-state.ts`
- `scripts/write-closure-state.ts`

Unified state I/O:

- `scripts/write-evidence-state.ts`
- `scripts/read-evidence-state.ts`

Command-side helper trials:

- `scripts/resume-helper.ts`
- `scripts/snapshot-helper.ts`

Shared helper:

- `scripts/evidence-helper.ts`

Purpose:

- bootstrap canonical files
- update structured state with stable merge behavior
- read preferred restart artifact in a fixed priority order
- support future command/runtime integration without duplicating filesystem logic

### 6. QA and Regression Layer

Main QA entry:

- `scripts/ctf-config-qa.ts`

Current QA coverage:

- tooling smoke
- Web benchmark wrapper
- PWN benchmark wrapper
- controller hard-regression audit
- command helper contract audit
- evidence bootstrap
- dedicated state writers
- unified writer
- unified reader
- resume helper
- snapshot helper

Package scripts:

- `npm run ctf:config-qa`
- `npm run ctf:hard-regression`
- `npm run ctf:command-contracts`
- `npm run ctf:evidence-init`
- `npm run ctf:write-evidence`
- `npm run ctf:read-evidence`
- `npm run ctf:resume-helper`
- `npm run ctf:snapshot-helper`

## Command Contracts

The most important controller commands now carry explicit artifact rules.

### Resume

File:

- `commands/ctf-resume.md`

Key contract:

- prefer structured restart artifacts before broad note reread
- default disk target is `resume.md`
- if needed, refresh `handoff.md` after stabilizing resume state

### Snapshot

File:

- `commands/ctf-snapshot.md`

Key contract:

- default disk target is `snapshot.md`
- prefer refreshing `route.json` and `primitive.json` before expanding markdown prose

### Closure

File:

- `commands/ctf-closure.md`

Key contract:

- default structured target is `closure.json`
- prefer structured endgame state refresh over freeform endgame prose

### Final

File:

- `commands/ctf-final.md`

Key contract:

- default disk target is `final-verification.txt`
- preserve resume and handoff artifacts as branch history

## Regression Inventory

Current controller hard-regression cases live under:

- `benchmarks/hard-regression/`

Current case families include:

- fast handoff behavior
- resume priority order
- evidence bootstrap
- evidence read order
- evidence tool pairing
- PWN substrate lock
- primitive lock to closure
- final preserves history
- snapshot writer contract
- closure writer contract
- resume helper contract
- snapshot helper contract
- command contract audit

These cases do not validate exploit payloads. They validate controller behavior, handoff quality, state discipline, and restart semantics.

## Current Strengths

The system is now strong at:

- separating controller concerns from specialist concerns
- forcing branch state into structured restart artifacts
- preserving primitive-to-closure intent across interruption
- testing configuration and controller drift on the current machine without `bun` on PATH
- keeping Web and PWN benchmark checks runnable through Node plus local `tsx`

## Current Limits

The system still has limits.

- command files describe helper-first behavior but do not themselves execute helper logic automatically
- `notes.md` still exists as a practical fallback even though structured evidence is stronger
- `route.json`, `primitive.json`, and `closure.json` are lightweight templates, not fully versioned schemas
- hard-regression checks controller case structure and contract presence, not full simulated solve traces

## Recommended Operating Pattern

For non-trivial challenges:

1. Enter through `ctf-master` for CTF solving, `daily` for normal work, or `researcher` for KB maintenance
2. Bootstrap `work/ctf-evidence/<slug>/` early
3. Keep `route.json`, `primitive.json`, and `closure.json` current enough for restart
4. Use `resume.md`, `handoff.md`, `fast-handoff.md`, and `snapshot.md` as human-readable checkpoints
5. Before changing controller commands, agents, evidence helpers, or regression cases, run config QA

## Practical Next Step

The next meaningful upgrade is not another prompt expansion. It is deeper runtime integration between controller commands and the evidence helper layer so that `resume`, `snapshot`, `closure`, and `final` can use the same structured state path consistently.
