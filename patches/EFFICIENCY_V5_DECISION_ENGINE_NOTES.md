# EFFICIENCY V5 Decision Engine Patch

This patch upgrades the previous v4 evidence-driven rules into a structured decision engine for medium and hard CTF challenges.

## Main improvements

- Replaces loose Hypothesis Ledger guidance with a scored Hypothesis Queue.
- Adds explicit Value, Confidence, Cost, Risk, and Stability scoring.
- Adds mandatory Route, Depth, Pivot, and Final Chain gates.
- Adds Oracle Calibration before deep payload/oracle attempts.
- Adds Failed Branch Cache and Disconfirmation Rule to prevent repeated template spraying.
- Adds Adversarial Review before budget-heavy branches, final exploit, and failure.
- Adds Clean-State Verification before final reporting.
- Adds category-specific primitive ladders for Web, pwn, rev, crypto, forensics, and misc.
- Adds Web-specific backward slicing, State Diff Ledger, and Pattern Retrieval Gate.

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
- `skills/ctf-common/SKILL.md`
- `skills/ctf-web/SKILL.md`
- `skills/ctf-web-attack-queue/SKILL.md`
- `skills/ctf-pwn/SKILL.md`
- `skills/ctf-rev/SKILL.md`
- `skills/ctf-crypto/SKILL.md`
- `skills/ctf-forensics/SKILL.md`
- `skills/ctf-misc/SKILL.md`

## Design intent

The patch is decision-focused rather than payload-list-focused. It should improve medium/high difficulty solves by forcing the agent to rank hypotheses, calibrate oracles, kill bad branches, pivot on differentials, and verify final chains from a clean state.

## Validation

Run:

```bash
python3 -m json.tool opencode.jsonc >/dev/null
npm run check
```
