# CTF State Schema

This document defines which CTF state artifacts are core, which are optional, and which tool should maintain them. The goal is to prevent direct JSON editing drift.

## Principle

The agent should prefer structured state tools over manual JSON edits.

Preferred update flow:

```text
observe evidence -> call state tool -> receive ranked next action -> probe or close
```

## Core state files

| File | Purpose | Updated by | Manual edit |
|---|---|---|---|
| `work/ctf-evidence/<slug>/inventory.md` | Target inventory, source/runtime availability, first safe mapping plan. | `/ctf-hard-open`, `/ctf-route`, `write-evidence-state inventory` | Yes, compactly. |
| `work/ctf-evidence/<slug>/route.json` | Route owner, support surface, budget profile, first safe tool, next probe. | `/ctf-hard-open`, `/ctf-route`, `write-evidence-state route` | Recovery only. |
| `work/ctf-evidence/<slug>/hypotheses.json` | Canonical top queue and next probe outside controller internals. | `/ctf-hard-open`, `/ctf-fanout`, `write-evidence-state hypotheses` | Recovery only. |
| `work/ctf-evidence/<slug>/signal-memory.yaml` | High-value signal debt and terminal candidate refresh. | `/ctf-signal-memory`, `write-evidence-state signal-memory` | Yes, if tool unavailable. |
| `work/ctf-evidence/<slug>/primitive.json` | Confirmed primitive, boundary, closure owner, blocker. | primitive lock / closure updates | Recovery only. |
| `work/ctf-evidence/<slug>/closure.json` | Ranked closure queue and blocker state. | `/ctf-closure`, `/ctf-close`, `write-evidence-state closure` | Recovery only. |
| `.ctf-decision-state.json` | Top-3 hypotheses, probes, observations, gates, ranking warnings. | `ctf-decision-state` | Avoid except recovery. |
| `.ctf-chain-state.json` | Segmented chain DAG, shared prefixes, branch status, blockers. | `/ctf-chain-dag`, `ctf-decision-state`, future `ctf-solve-state` | Avoid except recovery. |
| `evidence.json` | Target inventory, artifacts, routes, signals, facts, unknowns. | future `ctf-solve-state`, manual notes when simple | Yes, compact facts only. |
| `primitive-ledger.json` | Confirmed/likely primitives and closure implications. | future `ctf-solve-state` | Avoid after primitive lock. |
| `closure-queue.json` | Ordered closure probes with success oracle and kill condition. | future `ctf-solve-state`, closure gate | Avoid broad prose. |
| `retro.md` | Post-solve learning and feedback. | `/ctf-retro-lite`, `/ctf-retro-kb` | Yes, sanitized only. |

## Optional state files

| File | Purpose | When to use |
|---|---|---|
| `endpoint-matrix.md` | Routes, methods, auth, object IDs, state transitions. | Web/API workflows. |
| `owner-matrix.json` | Primary owner, support surface, handoff triggers. | Mixed-category or multi-component solves. |
| `whitebox-handoff.json` | Source audit facts, entrypoints, sinks, sanitizers, candidate findings. | Source/bytecode/config challenges. |
| `blocked-hypotheses.json` | Branches frozen due to blockers/no differentials. | Medium/hard branching. |
| `flag-location.json` | Flag storage/read path model. | Primitive confirmed but flag path unclear. |
| `local-harness-verification.json` | Harness plan and verdict. | Source-derived finding needs local proof. |
| `best-evidence-snapshot.json` | Five-line strongest evidence checkpoint. | Resume, pivot, or closure stalls. |

## State operation vocabulary

Future and extended tools should support action-style updates:

```text
init_challenge
set_route
add_asset
add_signal
add_hypothesis
add_observation
mark_confirmed
mark_falsified
mark_blocked
add_primitive
closure_promote
add_closure_probe
next_action
snapshot
resume_summary
final_candidate
```

## Hypothesis minimum fields

```json
{
  "id": "h-web-jwt-001",
  "primitive": "JWT role boundary",
  "family": "jwt",
  "value": 4,
  "confidence": 2,
  "infoGain": 4,
  "cost": 1,
  "risk": 1,
  "stateDamage": 0,
  "stability": 4,
  "closureDelta": 2,
  "branchKillValue": 2,
  "nextTest": "Decode shape and test one clean role-boundary oracle without trusting unsigned data.",
  "killRule": "No JWT/session trust boundary or role consumer found.",
  "whyNow": "Cookie/session evidence plus admin route signal.",
  "whyNotOthers": "Cleaner oracle than generic route fuzzing."
}
```

## Closure probe minimum fields

```json
{
  "order": 1,
  "probe": "Read config path through confirmed LFI",
  "successOracle": "Config key names or flag path appear",
  "failureCondition": "Stable denied/error result for two path classes",
  "risk": "read-only"
}
```

## Hygiene

- Do not store full cookies, sessions, API keys, private keys, personal credentials, or out-of-scope secrets.
- Do not store live flags in reusable lessons or SecKB notes.
- Prefer fingerprints, key names, file paths, and sanitized evidence over raw secrets.
