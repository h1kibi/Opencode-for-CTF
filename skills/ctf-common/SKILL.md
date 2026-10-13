---
name: ctf-common
description: Use for authorized CTF, lab, benchmark, or local challenge solving across web, pwn, reverse engineering, forensics, crypto, and misc. Provides scope control, evidence rules, notes discipline, reproducible output requirements, and anti-hallucination rules.
compatibility: opencode
---

# CTF Common

## Purpose

Use this skill at the start of any authorized CTF challenge. It provides the solve loop: scope, inventory, task tree, evidence, execution, verification, and final output.

This skill adapts workflow ideas from PentestGPT-style task trees and D-CIPHER-style planner/executor loops without copying their prompts or granting broader attack scope.


## Load When

Load first for every authorized challenge, then keep it available as the shared safety and evidence contract. Do not load it as a substitute for a category orchestrator.

## Do Not Load When

Do not use this skill to choose a vulnerability payload, perform broad reconnaissance, or replace `ctf-router`, `ctf-lead`, or a category skill.

## Required Inputs

Require the authorization/scope statement, artifact inventory, service access method, constraints, and any existing evidence or resume state.

## First Safe Action

Confirm authorization and scope, inventory the supplied artifacts, and create or update the smallest restartable notes/evidence record before active probing.

## Dispatch / Handoff

Hand off classification to `ctf-router`; hand off category execution to the selected category orchestrator. Return to this skill for scope, evidence, reproducibility, or safety conflicts.

## Ownership and State Precedence

- `ctf-router` owns initial lane/category selection.
- `ctf-lead` owns current phase and active owner.
- `ctf-decision-engine` owns hypothesis/probe ranking.
- `ctf-ledger-discipline` owns compact state refresh and resume hygiene.
- `ctf-closure-gate` owns post-primitive convergence.
- Live artifact evidence outranks recalled lessons, route scores, and intuition.

## Scope

Allowed targets:

- Local challenge services.
- Dockerized CTF tasks.
- Official CTF platforms.
- Explicitly authorized labs.
- User-provided challenge files.

Do not attack unrelated third-party systems, scan unrelated networks, or use external services unless the user explicitly authorizes that target.

## Inputs

Collect these before acting:

- Challenge name, category, description, flag format, target URL or host if present.
- File inventory, including README, Dockerfile, docker-compose, challenge metadata, source, binaries, pcaps, archives, and configs.
- Service access method: local binary, localhost web service, netcat service, Docker network, or static files only.
- Constraints: timeouts, remote-only behavior, sandbox, no-network requirement, provided credentials, or required flag wrapping.

## Flag closure contract

Load `references/flag-candidate-oracle.md` whenever any output looks flag-like. Keep the shared state machine `untrusted_hint -> flag_candidate -> oracle_verified -> closed`; use `ctf-flag-verify` before `ctf-evidence-board command=flag-verify`. Format matches and challenge-specific regexes only produce candidates. Bare hashes require explicit flag-file/readflag context. Never stop, report success, or write `agent_flag.txt` until `oracle_verified: true`.
## Workflow
1. Create or update `notes.md` with challenge summary, file inventory, assumptions, and next steps.
2. Build a task tree with hypotheses and the cheapest safe experiment for each hypothesis.
3. Execute one task at a time and record the result before choosing the next task.
4. Parse observations into facts, uncertainties, and failed paths.
5. Update the task tree after each meaningful command, HTTP response, debugger result, or file finding.
6. Prefer local reproduction when source, Docker files, or binaries exist.
7. For PWN/REV-shaped work, check the prepared Docker lab environment before runtime-sensitive testing, select the matching challenge Docker or prepared lab image, and keep testing inside that chosen container until a concrete blocker justifies switching.
8. Produce a reproducible solver or exploit script when practical.
9. Verify the flag from challenge behavior or artifact evidence before finalizing.

## Reusable Templates

When the solve is non-trivial, start from the smallest matching template under `templates/` instead of inventing ad hoc structure:

- `templates/ctf_plan.md` for route planning or hard-open work.
- `templates/ctf_handoff.md` for branch handoff, pause, or owner switch.
- `templates/ctf_evidence_snapshot.md` for compact restart value.
- category-specific templates such as `templates/pwn_notes.md` when the branch requires deeper domain notes.

## Convergence Checkpoint

After every meaningful observation, decide whether to continue exploring or lock the current best path.

Update this table in `notes.md`:

| Hypothesis | Evidence | Cost to Verify | Risk | Expected Gain | Keep/Drop |
|---|---|---:|---:|---:|---|

Lock the current path when:

- A critical primitive is confirmed.
- Two high-value primitives can be composed.
- Further probing would only produce equivalent payload variants.
- A stable control plane is available.
- The next exploratory branch has higher risk than the current exploit path.

Drop a branch when:

- Three variants fail without changing the hypothesis.
- The branch requires unstable state changes while a safer chain exists.
- The branch depends on browser/runtime behavior that is incompatible with observed bot environment.
- The branch needs external infrastructure when a challenge-local channel exists.
- The branch only improves convenience, not exploitability.

Before switching branches, write one sentence:

`Switching because: <old branch failed due to X>; <new branch has stronger evidence Y>.`

Do not branch-hop silently.

## Docker Lab Stability for PWN/REV

When a branch is PWN- or REV-shaped, treat runtime substrate choice as an early evidence item, not an incidental convenience:

1. Check prepared lab readiness first (`ctf-env-check category=pwn` or `ctf-env-check category=rev`; PWN may also use `ctf-pwn-check-env`). Record available Docker daemon, built pwnlab/revlab images, challenge Dockerfile/compose, architecture, libc/loader, and mount path.
2. Choose the best substrate once: challenge-provided Docker/compose when present and runnable; otherwise the closest prepared pwnlab/revlab image for the architecture/libc/tooling need.
3. Lock the chosen substrate in the notes/checkpoint (`challenge-docker`, `pwnlab-docker`, `revlab-docker`, `host`, `remote-only`) with one sentence explaining why.
4. Run runtime-sensitive probes, exploit/debug iterations, emulation, and validation inside that container. Do not alternate host/WSL/Docker just because quoting or one convenience command failed.
5. Switch to host or remote only when there is a concrete blocker or new validation goal: Docker unavailable, required GUI/device/hardware feature missing, host-only artifact needed, final remote adaptation, or proven local/remote drift.
6. Before switching, write: `Switching substrate because: <current substrate blocker>; <new substrate evidence/goal>`.

## Tool Discipline

- State the purpose before running non-trivial commands.
- Use targeted file reads and searches before broad recursive dumps.
- Summarize long outputs into addresses, parameters, routes, stack traces, error messages, constants, and decision points.
- For interactive tools, use `ctf-terminal`.
- Do not use hidden evaluator metadata, answer files, or ground-truth fields as the solution when the harness intends them to be hidden.

## Shared Execution Discipline

Category agents should keep their prompts focused on domain-specific workflow. Use this common discipline for cross-category behavior:

- Visible text before an active probe/tool call should be at most one short sentence unless a user-facing gate, final result, safety decision, or stuck checkpoint is required.
- Do not narrate broad alternatives during active solving. Convert uncertainty into one controlled probe, one state update, one pivot, one final check, or one explicit resource request.
- For any non-trivial branch, keep at most top-3 active hypotheses and change one variable per probe.
- A changed payload string is not a changed hypothesis. A new hypothesis changes the primitive, sink, oracle, parser, state boundary, owner, or closure path.
- After two or three same-family attempts without a new differential, rerank, pivot, or mark the branch blocked instead of continuing payload roulette.
- Once a high-value primitive is confirmed, stop broad recon and build the shortest closure path to flag/source/config/secret/admin/export/output.
- On resume after interruption, do not restart recon by default. Reconstruct the strongest evidence, current owner, confirmed primitive or signal, blocker, and next one-variable probe.

## Shared Checkpoint Contract

When a solve becomes branchy, interrupted, or ready for handoff, record a compact checkpoint instead of a long retrospective:

- target / scope / flag format
- current primary owner and support surface
- strongest evidence and confirmed facts
- confirmed primitive or strongest non-proof signal
- failed same-family attempts already spent
- current blocker or uncertainty
- exploit / solve artifact path if present
- next one-variable probe with oracle and falsify condition

If the branch is likely to pause, switch owner, or survive interruption, prefer `templates/ctf_handoff.md` or `templates/ctf_evidence_snapshot.md` over freeform notes.

## Restart Artifact Priority

When resuming a solve or handing control between `ctf-expert` and its category specialists, prefer structured restart artifacts over broad note rereads.

Preferred human-readable restart order under `work/ctf-evidence/<challenge-slug>/`:

1. `resume.md` seeded from `templates/ctf_resume_packet.md`
2. `fast-handoff.md` seeded from `templates/ctf_fast_handoff.md`
3. `handoff.md` seeded from `templates/ctf_handoff.md`
4. `snapshot.md` seeded from `templates/ctf_evidence_snapshot.md`

Preferred structured packet to pair with the restart artifact:

- `inventory.md`
- `route.json`
- `hypotheses.json`
- `signal-memory.yaml`
- `primitive.json`
- `closure.json`

Use markdown restart artifacts to recover compact human context, and structured files to recover controller state. Do not let `notes.md` outrank an existing structured restart artifact unless the structured packet is stale or missing required fields.

If the packet quality is uncertain, run `ctf:evidence-doctor <challenge-slug>` or `node scripts/ctf-evidence-doctor.ts <challenge-slug>` before continuing.

## Evidence Packet Hygiene

For non-trivial branches, keep the structured evidence packet minimally executable:

- `route.json` should expose `primary_owner`, `first_safe_tool`, and the current route/budget posture.
- `primitive.json` should expose the current primitive and `closure_owner` once a strong primitive exists.
- `closure.json` should expose the current `closure_owner`, top closure probe, and blocker when the branch is in closure-first mode.
- `hypotheses.json` should expose a compact queue or hypothesis list that can survive restart.

When the branch changes owner, queue shape, or closure posture materially, refresh the packet before more probing. Prefer dedicated evidence writers and helpers over ad hoc prose.

## Evidence Discipline

For non-trivial solves, keep a compact evidence directory under `work/ctf-evidence/<challenge-slug>/` when practical. Suggested files:

- `inventory.txt` - files, services, runtime, and flag format
- `route.json` - current owner, support surface, and top route summary
- `probes.jsonl` - one-line probe packets with oracle/result
- `primitive.json` - confirmed primitive and closure implications
- `closure.json` - ordered closure probes and downgrade trigger
- `solve-output.txt` - sanitized final solver transcript or local output proof
- `final-verification.txt` - why the flag is real and how it was reproduced
- `retro.md` - post-solve lesson capture or patch proposal

Rules:

- `agent_flag.txt` is for the exact verified flag only.
- Do not store reusable live secrets, raw cookies, private keys, or challenge credentials in reusable lesson artifacts.
- If local and remote behavior diverge, keep a compact local/remote transcript or summary before mutating the payload family.
- If a `ctf_rag` hit materially influenced the branch, record that evidence before the final retro ends.

## Flag Identification

Use `references/flag-identification-rules.md` as the canonical default. In short:

- Accept only strict `prefix{payload}` candidates by default: 3–80 character prefix, 10–80 safe payload characters, and no whitespace/newlines.
- Accept UUID-shaped `flag{...}` values as high-confidence candidates.
- Reject bare MD5/SHA-256 unless the same source context explicitly names a flag file/helper or reads `/flag`; generic hash context is insufficient.
- A candidate is evidence, not success. Only an independent exact/file/hash oracle upgrades it to `oracle-verified`.
- Preserve source/origin/context and never write `agent_flag.txt` from a regex hit, short sample, decoy, or unverified hash.

## Accuracy Rules

- Never write `agent_flag.txt` from a guess.
- A flag is verified only if it appears in a challenge response, a file extracted by a justified path, solver output, debugger/program output, or official local service output.
- If two hypotheses conflict, prefer the one supported by command output or source code.
- Prefer one minimal confirming test over five speculative tests.
- When stuck, summarize evidence before trying a new class of attack.
- Do not repeat a failed payload family without changing the hypothesis.
- Treat metadata flags, answer files, and benchmark ground truth as out of scope unless the task explicitly asks for evaluator maintenance.

## Timebox Strategy

- First 3 minutes: classify category and inventory files/services.
- Next 7 minutes: test top 3 hypotheses only.
- If no progress after 10 minutes: write a stuck summary and choose a new branch.
- If no progress after 20 minutes: generate `failure_report.md` with missing signals and likely skill gaps.

## Failure Report

When giving up or timing out, create `failure_report.md`:

````markdown
# Failure Report

## Challenge
- Name:
- Category:
- Files:
- Target:

## What worked
-

## What failed
| Attempt | Reason | Evidence |
|---|---|---|

## Missed signals
-

## Likely category
-

## Skill gaps
-

## Proposed skill patch
```markdown
...
```
````

## Evidence Requirements

Do not claim a result unless it is supported by at least one of:

- File content.
- Command output.
- HTTP response.
- Debugger output.
- Decompiler output.
- Reproduced local exploit.
- Verified challenge response.

Never invent flags. Never write `agent_flag.txt` from a guess.

## Output Contract

Maintain these when useful:

- `notes.md`: observations, hypotheses, commands, outputs, failures, next steps.
- `solve.py`, `solve.js`, `solve.sage`, or `exploit.py`: reproducible solver.
- `agent_flag.txt`: exact final verified flag only.

When a matching file exists under `templates/`, copy it as the starting point instead of writing a solver from scratch.

When solved, summarize root cause, exploit path, verification evidence, and the solver entry point.

If the solve was branchy or source-guided, also record the shortest reproduction path in `final-verification.txt`: setup -> primitive -> oracle -> closure step -> flag.

## Stop Conditions

Stop or ask the user when:

- The target scope is unclear or appears non-CTF/non-authorized.
- Required remote services are unavailable.
- A destructive command or broad network scan would be needed.
- Multiple plausible paths remain but the next step has high cost or risk.
- The flag is only guessed or only present in metadata not meant for solving.
