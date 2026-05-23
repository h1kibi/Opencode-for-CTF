---
name: ctf-common
description: Use for authorized CTF, lab, benchmark, or local challenge solving across web, pwn, reverse engineering, forensics, crypto, and misc. Provides scope control, evidence rules, notes discipline, reproducible output requirements, and anti-hallucination rules.
compatibility: opencode
---

# CTF Common

## Purpose

Use this skill at the start of any authorized CTF challenge. It provides the solve loop: scope, inventory, task tree, evidence, execution, verification, and final output.

This skill adapts workflow ideas from PentestGPT-style task trees and D-CIPHER-style planner/executor loops without copying their prompts or granting broader attack scope.

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

## Workflow

1. Create or update `notes.md` with challenge summary, file inventory, assumptions, and next steps.
2. Build a task tree with hypotheses and the cheapest safe experiment for each hypothesis.
3. Execute one task at a time and record the result before choosing the next task.
4. Parse observations into facts, uncertainties, and failed paths.
5. Update the task tree after each meaningful command, HTTP response, debugger result, or file finding.
6. Prefer local reproduction when source, Docker files, or binaries exist.
7. Produce a reproducible solver or exploit script when practical.
8. Verify the flag from challenge behavior or artifact evidence before finalizing.

## Tool Discipline

- State the purpose before running non-trivial commands.
- Use targeted file reads and searches before broad recursive dumps.
- Summarize long outputs into addresses, parameters, routes, stack traces, error messages, constants, and decision points.
- For interactive tools, use `ctf-terminal`.
- Do not use hidden evaluator metadata, answer files, or ground-truth fields as the solution when the harness intends them to be hidden.

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

```markdown
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
```

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

When solved, summarize root cause, exploit path, verification evidence, and the solver entry point.

## Stop Conditions

Stop or ask the user when:

- The target scope is unclear or appears non-CTF/non-authorized.
- Required remote services are unavailable.
- A destructive command or broad network scan would be needed.
- Multiple plausible paths remain but the next step has high cost or risk.
- The flag is only guessed or only present in metadata not meant for solving.
