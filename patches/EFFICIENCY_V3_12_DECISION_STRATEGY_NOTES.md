# EFFICIENCY V3.12 Decision Strategy Patch

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

This patch keeps the existing permission, timeout, tool, and flag-reporting behavior from the uploaded configuration, and adds a cross-category decision strategy layer to CTF agents and CTF commands.

## Main goal

Reduce wrong-direction time caused by payload-template inertia. The agents should solve by evidence-driven hypothesis search instead of repeatedly trying familiar payload families after weak or negative evidence.

## Added rules

- Source -> Transform -> State -> Sink -> Oracle modeling before deep exploitation.
- Compact Hypothesis Ledger for non-trivial solves:
  - hypothesis
  - supporting evidence
  - negative evidence
  - next cheapest discriminating experiment
  - expected result
  - kill/downgrade condition
  - priority
- Strong Signal Pivot Rule:
  - repeatable warning/path/state/output/timing/crash/leak/parser differences become high-confidence pivots.
  - generic enumeration pauses while the agent explores the signal.
- Template Inertia Guard:
  - no more than 3 consecutive attempts from the same generic family without new evidence.
  - no branch should consume about more than 25% of the budget unless it keeps producing new evidence.
- Planner Checkpoint Rule:
  - every ~5 tool calls, after surprising output, before spawning subagents, and before declaring failure.
- Primitive-first classification:
  - content/name/path/state/length/oracle/control-flow control
  - memory disclosure
  - address control
  - randomness reuse
  - parser differential
  - permission-boundary crossing

## Web-specific addition

For Web source-guided challenges, application-created state near a sink is treated as a first-class primitive. The agent should model app-created objects, state transitions, controllable path/name/content/state fields, persistence, and relative-resolution semantics before falling back to generic bug-class chains.

## Files changed

- `opencode.jsonc`
  - `ctf-agent` prompt
  - `ctf-web` prompt
  - `ctf-pwn` prompt
  - `ctf-rev` prompt
  - `ctf-crypto` prompt
  - `ctf-forensics` prompt
  - `ctf-misc` prompt
  - `ctf-retro` prompt
- `commands/ctf.md`
- `commands/ctf-web.md`
- `commands/ctf-pwn.md`
- `commands/ctf-rev.md`
- `commands/ctf-crypto.md`
- `commands/ctf-forensics.md`
- `commands/ctf-misc.md`
- `commands/ctf-web-retro.md`

## Validation

- JSON parse OK.
- TypeScript check OK.
