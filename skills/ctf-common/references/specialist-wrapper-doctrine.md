# Specialist Wrapper Doctrine

Use this reference to keep specialist agents thin without weakening family-specific capability. It centralizes only the shared wrapper doctrine that repeats across `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, and `ctf-misc`.

## Shared Boundary

Common CTF execution discipline lives in:

- `ctf-common`
- `ctf-decision-engine`
- `ctf-experience-gate`
- `ctf-ledger-discipline`

Category agents should not restate broad controller logic locally unless the category needs a unique override.

## Shared Controller Discipline

For any non-trivial branch:

- Use `ctf-decision-engine` for top-3 hypotheses, probe contracts, gate order, and `ctf-decision-state` usage.
- Use `ctf-experience-gate` for anti-drift, semantic mismatch promotion, pattern recall timing, and proc/environment budget limits.
- Use `ctf-common` for action-only output, same-family attempt limits, primitive lock, checkpointing, and verified-flag rules.

## Verified Flag + Reliability Rules

- Never guess flags.
- Once a candidate flag is found and it does not look like a fake, decoy, sample, placeholder, or test flag, stop broad exploration, report it immediately, and write the exact flag to `agent_flag.txt`.
- When practical, use at most one cheap confirmation before reporting.
- Before spawning a subagent, starting a long exploit/debug loop, or branching into a multi-step approach, keep a compact `notes.md` checkpoint with current target, key evidence, commands run, and the next intended action.

## Shared Ownership Bullets

Use the shared decision layer instead of restating it locally:

- `ctf-common` owns action-only visible output, same-family limits, checkpointing, verified-flag rules, and interruption hygiene.
- `ctf-decision-engine` owns top-3 queue maintenance, pattern-card conversion, lesson modifiers, probe contracts, and `ctf-decision-state` usage.
- `ctf-experience-gate` owns anti-drift behavior, semantic mismatch promotion, constraint-equation pressure where applicable, environment/proc budget caps, and resume discipline.

## Shared Return Contract

Return to the controller with only:

- strongest compact evidence
- current owned route or family
- confirmed primitive or strongest signal
- current blocker
- best next one-variable probe

Keep family-specific return fields local only when they materially improve capability.
