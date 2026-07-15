---
description: CTF chain-DAG: Convert SecKB/pattern/live evidence into segmented exploit-chain DAG with OPEN/BLOCKED/DEAD backtracking discipline
agent: ctf-master
subtask: false
---

Build or update a segmented exploit-chain DAG for a rigorous CTF solve.

Evidence / chain hits:
$ARGUMENTS

Purpose:
- Convert knowledge hits, live evidence, and pattern cards into composable chain segments.
- Avoid flat hypothesis drift by preserving shared prefixes and terminal branch alternatives.
- Make missing prerequisites become targeted recon tasks instead of vague exploration.
- Enforce route states: OPEN, BLOCKED, DEAD, plus segment states UNTESTED, CONFIRMED, BLOCKED, BYPASSED, FALSIFIED, SKIPPED.

Segment model:
Each segment must describe:
- `segmentId`: stable id
- `produces`: primitive/evidence produced by this segment
- `requires`: prerequisites needed before this segment is meaningful
- `controlledInput`: route/param/file/artifact/data under attacker control
- `sinkOrOracle`: sink, output, timing, OOB, crash, readback, or state differential
- `firstProbe`: one-variable check
- `confirm`: exact evidence that marks CONFIRMED or BYPASSED
- `falsify`: exact evidence that marks FALSIFIED/DEAD
- `blockedBy`: WAF/filter/permission/path/state blocker, if any
- `bypassPlan`: required if BLOCKED
- `parentId` and `prerequisiteIds`: DAG links
- `sharedPrefix`: true when downstream branches reuse this segment
- `terminalBranch`: true for final alternative exploitation endings
- `challengeSpecific`: true when segment uses author-written clue/logic rather than generic component noise
- `blindOrOob`: true when confirmation requires time/OOB/writeback oracle
- `oracleEvidence`: required before blind/OOB segment can be locked

Workflow:
1. Normalize live evidence into compact fields: category, owner, source/runtime availability, routes/artifacts, controlled inputs, sinks/oracles, blockers, confirmed primitives, unknowns.
2. Run SecKB segment/chain composition if not already done. Treat hits as candidate segments, not payload recipes.
3. For each matched chain, split it into reusable segments. Identify shared prefixes and terminal branches.
4. For missing `requires`, create targeted recon tasks using `seckb_recon_tasks` or direct source/tool checks. Do not probe terminal payloads before required prefixes are confirmed.
5. Initialize or update `ctf-decision-state` hypotheses using DAG fields:
   - `parentId`
   - `prerequisiteIds`
   - `segmentId`
   - `segmentState`
   - `branchId`
   - `sharedPrefix`
   - `terminalBranch`
   - `missingPrerequisites`
   - `blockedBy`
   - `bypassPlan`
   - `blindOrOob`
   - `oracleEvidence`
   - `challengeSpecific`
   - `authorIntent`
6. Pass `ctf-decision-state gate=chain_dag` before deep probing when the queue has reusable prefixes or terminal branches. Required `gateJson` fields: `segments`, `sharedPrefixes`, `terminalBranches`, `routeStates`, `nextSegment`, `backtrackRule`; add `blockedHandling`, `oracleEvidencePolicy`, or `missingPrereqRecon` when relevant.
7. Ranking policy:
   - CONFIRMED/BYPASSED shared prefixes unlock downstream branches.
   - OPEN chains with satisfied prerequisites outrank BLOCKED chains.
   - BLOCKED chains require bypass plan/evidence before more same-family probes.
   - DEAD/FALSIFIED terminal branches backtrack to nearest CONFIRMED shared prefix and try sibling branches.
   - Challenge-specific segments outrank generic component-only rabbit holes.
8. Backward missing-prereq mode:
   - If a valuable terminal chain is matched but an entry/prerequisite is missing, invert the chain: terminal primitive -> required capability -> required route/source clue -> first recon task.
   - The output must be a concrete recon probe, not a payload guess.
9. Blind/OOB discipline:
   - Blind/OOB segments cannot be CONFIRMED from 200 OK, response length, or hope.
   - Require timing differential, DNS/webhook/callback evidence, writeback, or privileged-state differential.

Return format:
1. Chain-DAG summary
2. Shared prefix segments
3. Terminal branches
4. Missing prerequisites as targeted recon tasks
5. OPEN/BLOCKED/DEAD chain state table
6. Decision-state hypothesis JSON sketch
7. `chain_dag` gate JSON sketch
8. Exactly one next probe or bypass/backtrack action

Rules:
- Do not repeat probes for a confirmed shared prefix when testing a terminal branch.
- Do not continue a BLOCKED branch without bypass plan/evidence unless the chosen action is explicit bypass planning.
- Do not mark blind/OOB as confirmed without oracle evidence.
- Do not keep generic component-only chains in top-3 if a challenge-specific segment with a clean oracle exists.
