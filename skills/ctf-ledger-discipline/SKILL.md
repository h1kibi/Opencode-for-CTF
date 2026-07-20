---
name: ctf-ledger-discipline
description: Use for long-run hard CTF branch control: hypothesis queue discipline, chain-ledger cadence, resume snapshots, pivot bookkeeping, and anti-drift state synchronization.
compatibility: opencode
---

# CTF Ledger Discipline

Use this skill when a challenge has multiple plausible branches, repeated pivots, interrupted progress, or any risk that the solver may lose track of the best evidence path.

## Agent Integration Contract

Category agents and `ctf-expert` should treat this skill as the shared source for executable checkpoints, top-3 queue refreshes, best-evidence snapshots, pivot bookkeeping, and resume-state hygiene. Keep agent prompts focused on domain or controller behavior; use this skill when the solve needs compact restart value, not another long prose refresh.

This skill is not about discovering new payloads. It is about keeping the solve state executable.

## Source of Truth

`ctf-expert` is the normative source of truth for queue size, pivot discipline, shared-segment reuse, and anti-drift behavior. This skill should synchronize state, not restate the whole doctrine.

## When To Use

Load this skill when any of the following is true:

- More than one active hypothesis is plausible.
- The chain ledger or best evidence snapshot is stale.
- The solver resumed after interruption/termination.
- A pivot is being considered after flat probes.
- A shared early segment exists across multiple possible terminal branches.

## Core Role

When active, do only four things:

1. Refresh the top-3 hypothesis queue.
2. Refresh the chain ledger.
3. Refresh the Best Evidence Snapshot.
4. Make the next pivot or next probe explicit.

If the current state is already crisp and one obvious low-noise action can win immediately, let `ctf-expert` fast-path rules win instead of forcing extra ceremony.

## Minimal Required State

Each active hypothesis should remain compact and executable:

- `id`
- `claim`
- `controlled_input`
- `oracle`
- `confirm`
- `falsify`
- `next_probe`
- `flag_path`
- `chain_ref` if applicable
- `owner`
- `supporting_surface`
- `closure_owner`
- `why_not_other_branches`

For long or interruption-prone branches, pair this compact queue with the structured evidence packet under `work/ctf-evidence/<challenge-slug>/`.

Minimum restart-supporting files:

- `route.json`
- `hypotheses.json`
- `signal-memory.yaml`
- `primitive.json`
- `closure.json`
- one human-readable restart artifact: `resume.md`, `fast-handoff.md`, `handoff.md`, or `snapshot.md`

Preferred restart artifact order is owned by `ctf-common`. This skill owns the cadence: refresh the packet when the owner changes, when the queue changes materially, when closure posture changes, or before pause/suspend/handoff.

Best Evidence Snapshot should remain compact:

- `strongest_evidence`
- `current_primary_owner`
- `supporting_surface`
- `closure_owner`
- `best_hypothesis`
- `best_oracle`
- `current_boundary`
- `confirmed_primitive` if any
- `nearest_flag_path`
- `next_probe`
- `why_not_other_branches`

Pivot Bookkeeping should also capture:

- `blocked_or_dead`
- `revisit_trigger`
- `closure_delta`
- `branch_kill_value`

## Evidence Doctor Cadence

When the branch is non-trivial and one of these transitions occurs, refresh packet quality with `ctf:evidence-doctor <challenge-slug>` before continuing:

- resume after interruption
- owner handoff or support-surface change
- closure-first transition
- checkpoint for suspend/handoff
- noisy branch where notes and structured state may have drifted apart

The evidence doctor is a packet-quality check, not a substitute for hypothesis ranking.

## Failure and closure bookkeeping

When a branch is demoted or a primitive locks, capture one compact record:

| kind | signal | blocked_by | kill_signal | closure_owner | next_probe |
|---|---|---|---|---|---|

Do not elaborate beyond what is needed to continue execution.

## Output Contract

Return compact stateful updates only:

- top-3 queue summary
- current primary owner
- current best evidence snapshot
- branch/pivot decision
- next probe

If ownership changes, explicitly state the new `closure_owner`.

Do not output broad theory. Output executable state.
