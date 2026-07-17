---
description: CTF ledger: Refresh hypothesis queue, chain ledger, resume snapshot, and pivot bookkeeping for hard branches
agent: ctf-expert
subtask: false
---

Run CTF Ledger Discipline.

Current branch / ledger state:
$ARGUMENTS

Rules:
- Use when branching is non-trivial, the solve resumed after interruption, pivots are repeating, or the chain ledger feels stale.
- This command is a thin state-synchronization entrypoint. Follow `ctf-expert` as the source of truth for anti-formalism, queue discipline, shared-segment reuse, and pivot rules.
- If the state is already crisp and one obvious low-noise action can win immediately, say so instead of forcing extra ledger ceremony.
- If unresolved P0/P1/P2 clues exist or high-value signals may have been forgotten, run or inline `/ctf-signal-memory` before changing the top branch. The ledger must preserve signal debt and terminal candidates, not only hypotheses.

Return style:
- Compact and stateful.
- Return top-3 queue summary, current primary owner, best evidence snapshot, pivot status, high-value signal debt summary, terminal candidate queue, and next probe.
- For each active hypothesis, include or refresh these fields when possible:
  - closure_delta
  - branch_kill_value
  - blocker / unblock condition
  - closure owner
  - failure-signature hint if the branch is being demoted

Ledger discipline:
- If a branch is stale, say whether it is stale because of low information gain, low closure movement, low branch-kill power, or owner mismatch.
- If a confirmed primitive exists, bias the ledger toward closure bookkeeping rather than discovery bookkeeping.
- When branch behavior matches a documented failure signature or anti-pattern, name it explicitly and reduce the branch budget unless new evidence appears.
- Prefer matching against lessons such as:
  - `failure-medium-value-primitive-drift.md`
  - `failure-source-not-prioritized.md`
  - `failure-flat-differential-branch-not-killed.md`
  - `failure-owner-should-switch-earlier.md`
  - `failure-primitive-confirmed-no-closure-model.md`
  - `failure-repeated-proc-enum.md`
  - `anti-pattern-*.md`

Negative-pattern discipline:
- If a branch matches a strategic anti-pattern, do not leave it merely as "possible". Mark the exact reason it is weak now and what evidence would be required to promote it again.
- If a matching lesson provides a budget penalty, copy that penalty into the ledger summary rather than keeping the branch at default budget.
