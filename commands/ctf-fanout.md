---
description: CTF control: OMO-style CTF fanout planner; split medium/hard challenges across scout, librarian, and oracle without exploiting
agent: ctf-master
subtask: false
---

Plan CTF fan-out for a medium/hard challenge.

Challenge context:
$ARGUMENTS

Rules:
- Do not exploit in this command.
- Use fan-out only when the challenge is non-trivial, source-heavy, multi-artifact, or has competing hypotheses.
- Spawn or recommend only information-gathering subagents:
  - `ctf-scout`: route map, first-tool result, evidence inventory.
  - `ctf-librarian`: pattern cards and technique recall from concrete evidence.
  - `ctf-oracle`: hypothesis sanity, false-positive risks, loop blockers.
- Do not ask subagents to run destructive actions, broad fuzzing, or final exploit chains.
- Main agent must merge results into top-3 hypotheses and exactly one next probe.
- Every subagent task must have a strict question, allowed evidence sources, forbidden actions, and expected compact output. Reject broad “analyze everything” tasks.
- Fanout outputs are not parallel solve tracks. Merge them immediately into one queue with one primary owner and at most one support surface.
- If subagents disagree, live evidence and cleaner oracle win; preserve losing branches as fallback/killed/blocked with a revisit trigger.
- After fanout, either call `ctf-decision-state init/rank` with the merged queue or state why direct probing is safe without controller state.
- After a meaningful owner/queue merge, refresh the packet with `ctf:evidence-doctor <challenge-slug>` when the slug is stable.
- Verifier is optional in fanout and should be used only when the branch is already near-final, a primitive claim needs confirmation, or a candidate flag path risks decoy/sample confusion.
- Subagent output contract:
  - `ctf-scout`: category, target, observed evidence, first safe tool result, top-3 initial hypotheses, blocked/risky actions.
  - `ctf-librarian`: ranked lesson/pattern hits, confirm/falsify probe, warning about misleading recall.
  - `ctf-oracle`: strongest claim, weakest assumption, one probe or pivot, explicit downgrade rules.
  - `ctf-verifier`: FINAL / NEED_ONE_CONFIRMATION / REJECT with minimal reproduction or decoy concern.

Return compactly:
1. Whether fan-out is justified: YES / NO.
2. Subagent tasks with strict scope.
3. Expected outputs from each subagent.
4. Merge plan.
5. Merge contract:
   - primary owner
   - support surface, if any
   - accepted facts
   - rejected or downgraded claims
   - top-3 merged hypotheses
   - one next probe
   - kill/pivot rule
   - evidence files to refresh: `route.json`, `hypotheses.json`, `signal-memory.yaml` when the merge changes owner, queue, or signal debt
6. Stop condition and next probe selection rule.
