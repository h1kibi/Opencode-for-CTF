# CTF Decision Engine

Use this skill when a CTF solve needs structured hypothesis ranking, probe contracts, gate checks, or chain/knowledge discipline.

## Agent Integration Contract

Category agents should not duplicate this full decision doctrine in their own prompts. They may reference this skill as the shared source for:

- top-3 hypothesis queue maintenance
- knowledge gate and negative-knowledge handling
- probe contracts with confirm/falsify/oracle/one-variable checks
- `ctf-decision-state` rank/probe/observe/gate/report usage
- owner handoff pressure and closure owner tracking
- anti-pattern penalties, lesson modifiers, and branch budget pressure

When a category agent has domain evidence but controller state is missing, build the smallest valid hypothesis and probe contract first; do not call `ctf-decision-state` with empty placeholders.

Keep this skill decision-centric. Domain exploit ladders, parser families, PWN runtime details, and Web bug payload families should stay in category skills, agents, and references.

## Mandatory gates

- After meaningful recon and before deep exploitation, run local knowledge retrieval/segment matching/chain composition.
- Then call `ctf-decision-state` with `operation="gate"`, `gate="knowledge"`, and evidence in one of these modes:

```json
{"queryRun": true, "matchedSegments": ["segment-id-or-title"], "knowledgeMode": "matched", "notes": "which SecKB tools were called"}
```

```json
{"queryRun": true, "matchedSegments": [], "knowledgeMode": "no_match_explained", "category": "crypto", "noMatchReason": "no RSA segment matches this oracle shape", "nextModelHypothesis": "small-subgroup / malformed-parameter route"}
```

```json
{"queryRun": true, "matchedSegments": ["weak-seg-1"], "knowledgeMode": "weak_match", "whyNotPrimary": "matched chain lacks sink/oracle alignment with current evidence", "nextModelHypothesis": "source-indicated parser differential"}
```

- Depth actions should call `gate="depth"` only after the knowledge gate has passed. Zero-hit or weak-match results are acceptable if they are explained honestly; do not fabricate KB hits just to satisfy the gate.

## Chain linkage

- When a hypothesis comes from a composed chain, include `chainRef` equal to the chain ledger's `chain_id`.
- `ctf-decision-state` rank will read `.ctf-chain-state.json` when present and penalize hypotheses whose linked chain is `BLOCKED` or `DEAD`.
- KB-supported hypotheses should usually enter the queue first when they fit the evidence, but non-KB hypotheses remain allowed. Admit a non-KB hypothesis when it explains the live evidence better than KB hits, especially after zero-hit, weak-match, or source/runtime disagreement.

## Top-3 admission discipline

- `knowledgeMode="matched"`: top-3 should keep at least one KB-supported hypothesis unless all KB chains are falsified, unsafe, or lack a flag path.
- `knowledgeMode="weak_match"`: top-3 should include at least one model/hybrid hypothesis that better explains live evidence.
- `knowledgeMode="no_match_explained"`: top-3 may be model/hybrid-heavy; do not keep a KB-only queue after documented zero-hit.
- These are admission warnings, not absolute kills. Live evidence, oracle quality, and flag proximity still override prior source.

## Hard-CTF ranking upgrade

For medium/hard branches, do not rank hypotheses only by generic value or information gain. Track two additional fields in the active queue and mention them explicitly during ranking, probe selection, and ledger refresh:

- `closure_delta`: how much the next successful probe would move the branch toward a direct flag path, source/config/secret read, admin/session control, executable path, or solver completion.
- `branch_kill_value`: how much a failed or flat result would honestly let you kill, freeze, or demote a broad competing branch/family rather than only one payload string.

Use these fields as practical ranking pressure:

- Prefer probes with high `closure_delta` when a credible primitive already exists and the challenge is entering closure/endgame.
- Prefer probes with high `branch_kill_value` when the queue is crowded, mixed-surface, or drifting across multiple plausible families.
- A probe with mediocre generic `InfoGain` may still outrank others if it sharply increases `closure_delta` or can kill a large wrong branch.
- A probe that produces only another same-family payload result with low closure movement and low kill power should rarely stay in top-1.

Operational interpretation:

- `closure_delta=3`: success would likely reveal flag/source/config/secret directly, establish admin/session needed for final read, complete a known exploit chain, or finish the solver.
- `closure_delta=2`: success would unlock a strong closure path or remove the last major blocker on a known primitive.
- `closure_delta=1`: success helps but still leaves multiple unresolved stages.
- `closure_delta=0`: success is mostly descriptive and should not dominate a hard branch.

- `branch_kill_value=3`: a flat/failing result would let you demote or freeze a whole family/owner/surface, not just one string variant.
- `branch_kill_value=2`: a result would prune a meaningful subfamily or supporting surface.
- `branch_kill_value=1`: a result only narrows a small local variant.
- `branch_kill_value=0`: a result is unlikely to change the queue.

Recommended hard-branch selection bias:

`hard_priority = (2*Value + Confidence + InfoGain + Stability + closure_delta + branch_kill_value) - (Cost + Risk + StateDamage)`

This does not replace existing controller scoring; it is a ranking interpretation rule for hard branches where closure quality and branch-kill power matter more than generic exploration.

Do not turn this skill into a category-specific route tree. Use it to rank and kill branches, then hand domain execution back to the matching owner.

## Mixed-owner queue discipline

When a challenge spans multiple surfaces such as Web + Java, Web + Rev, Web + Crypto, source + runtime, or file + service:

- Keep exactly one `primary owner` in the top queue.
- Allow at most one `supporting surface` unless a second surface is already proven to be a direct closure dependency.
- Each top hypothesis should state whether it is owned by the primary owner or depends on the supporting surface.
- If a supporting surface repeatedly supplies evidence but never owns the closure path, keep it supporting.
- If the supporting surface now explains the sink, oracle, or closure path better than the current owner, trigger an owner handoff instead of keeping two equal owners alive.

For every owner handoff candidate, record:

- `handoff_trigger`
- `return_trigger`
- `closure_owner`

This prevents mixed-surface hard challenges from degrading into parallel shallow exploration.

If the owner question dominates more than the probe question, prefer `/ctf-owner` or `/ctf-control` over writing longer mixed-owner theory here.

## Negative-knowledge discipline

Knowledge retrieval is not only for positive matches. During ranking, explicitly record when a family is weak because the local knowledge base suggests it is often misleading under the current evidence.

Useful negative-knowledge examples:

- reflection without a bot/secret/runtime path
- SSRF continuing after source acquisition already solved the information problem
- JWT decode without any sign of forgeable trust boundary
- GraphQL syntax curiosity without authz/object/state impact
- source already available but queue still dominated by blind black-box phenomena

If negative knowledge applies, do not merely lower `Confidence`; also lower `Value` or `closure_delta`, because the family may be real yet strategically weak.

## Failure-signature penalty discipline

When a branch matches a recorded failure signature or anti-pattern, apply an explicit ranking penalty instead of only discussing it narratively.

Examples:

- medium-value primitive drift -> reduce `Value` or `closure_delta`
- source not prioritized -> reduce competing black-box branch priority until the source-first branch is resolved
- flat differential branch not killed -> reduce `Stability` and raise pivot pressure
- owner should switch earlier -> reduce current owner's top-1 eligibility until handoff is evaluated
- primitive confirmed, no closure model -> reduce discovery branch priority and increase closure-first bias
- repeated proc/environment enumeration -> cut branch budget sharply unless new evidence appeared

If a branch matches a documented anti-pattern, record:

- anti-pattern name
- current penalty
- promotion trigger
- next non-anti-pattern probe

## Lesson-modifier integration

When local lesson evidence is strong, do not leave it as freeform commentary. Convert it into a compact modifier plan before final ranking or control decisions.

Preferred workflow:

1. Run `ctf-lesson-search` or identify a strong matching lesson from closure/owner/failure/anti-pattern families.
2. Run `ctf-lesson-modifier-plan` with the current evidence and matching family.
3. Feed the resulting modifiers into ranking, owner assessment, closure-first bias, or branch budget notes before the next probe.

At minimum, lesson-hit modifiers should influence:

- control action preference
- branch budget / penalty notes
- owner handoff pressure
- closure owner summary
- pattern-card fallback query selection

Hard rule:

- If a branch strongly matches a lesson family and the next action ignores its modifier plan, explicitly justify why live evidence overrides the lesson.

## Probe discipline

- Keep at most top 3 active hypotheses.
- Probe one variable at a time.
- After every probe, call `observe` before another same-family probe.
- If a chain or branch becomes `BLOCKED`, call the structured `ctf-waf-bypass-plan` tool with `blocker`, `stack`, `sink`, and compact evidence, or use `/ctf-waf-bypass-plan` as fallback. Try at most three bypass families without a new differential before marking the branch blocked/backtracked; mark it dead only when the sink/parser family itself is falsified.
