# EFFICIENCY V6 Decision Controller Patch

This patch upgrades the CTF agent decision layer from v5 scored hypotheses to an adaptive v6 controller intended for medium and hard CTF challenges.

## Main changes

- Adds `ctf-decision-engine` as a reusable category-agnostic skill.
- Adds a Difficulty Adapter: direct, medium, and hard modes so easy solves avoid bureaucracy while hard solves get stronger planning.
- Replaces simple score with `Score = (2*Value + Confidence + InfoGain + Stability) - (Cost + Risk + StateDamage)`.
- Adds Confidence, Value, and Stability caps to reduce overconfident payload-template routing.
- Adds StateDamage tracking and mandatory canary/rollback planning for irreversible mutations.
- Adds a Probe Contract: every non-trivial probe must define confirm/falsify/distinguish outcomes before execution.
- Adds Stuck Gate after two failed top branches or about 25% budget, forcing one orthogonal high-information test from a different evidence source.
- Updates router, common skill, Web orchestrator, attack queue, commands, and CTF agent prompts to reference v6.
- Assigns stronger CTF models explicitly and increases step budgets for medium/hard solves.

## Files changed

- `opencode.jsonc`
- `commands/ctf.md`
- `commands/ctf-web.md`
- `commands/ctf-pwn.md`
- `commands/ctf-rev.md`
- `commands/ctf-crypto.md`
- `commands/ctf-forensics.md`
- `commands/ctf-misc.md`
- `commands/ctf-web-retro.md`
- `skills/ctf-decision-engine/SKILL.md`
- `skills/ctf-common/SKILL.md`
- `skills/ctf-router/SKILL.md`
- `skills/ctf-web/SKILL.md`
- `skills/ctf-web-attack-queue/SKILL.md`

## Validation

Run:

```bash
python3 -m json.tool opencode.jsonc >/dev/null
npm run check
```
