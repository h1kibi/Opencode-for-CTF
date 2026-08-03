# Team Mode Lifecycle

This document describes the Team Mode runtime as a run/job orchestration subsystem.

## Canonical model

The canonical Team Mode model is the run/job state machine in `src/team/`.

Primary modules:

- `src/team/team-types.ts`
- `src/team/team-state.ts`
- `src/team/team-render.ts`
- `src/team/team-runtime-core.ts`
- `src/team-runtime.ts` as the compatibility façade

## State lifecycle

A Team Mode wave is represented by a `TeamRun`.
Each worker is represented by a `TeamJob`.

Typical job flow:

- `queued`
- `starting`
- `running`
- `retrying` (optional)
- terminal state: `completed | failed | cancelled | cancel_failed | interrupted`

Typical run flow:

- `dispatching`
- `running`
- `ready_for_synthesis`
- `completed`

Or degraded paths:

- `degraded`
- `cancelled`
- `cancelling`

## Control surface

The expert-facing tools are:

- `ctf-team-dispatch`
- `ctf-team-status`
- `ctf-team-collect`
- `ctf-team-cancel`
- `ctf-team-cancel-route`
- `ctf-team-close`
- `ctf-team-recover`
- `ctf-team-adopt` (explicitly rebinds a ready/degraded run after the old parent is proven absent; no active or uncertain workers)

Only the expert surface should control these operations.

## Event bridge

Runtime events reconcile worker state:

- `session.status`
- `session.idle`
- `session.error`
- `session.deleted`

The bridge is responsible for:

- collecting worker outputs on idle
- marking failed/interrupted workers
- notifying the parent expert session when synthesis is ready

## Worker contract

Workers must:

- stay within the authorized challenge scope
- avoid mutating canonical shared state files
- bind work to a route ID
- request heavy MCPs through the advisor flow
- return structured evidence rather than free-form wandering notes

## Maintenance rule

If a Team Mode change affects state transitions, change the `src/team/` core first and keep `src/team-runtime.ts` as a façade.
