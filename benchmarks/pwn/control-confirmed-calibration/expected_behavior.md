# Expected Behavior: control-confirmed-calibration

## Scenario

A PWN route already has crash/control proof, but exploit landing still depends on exact offset width, preserve-region behavior, parser side effects, stack alignment, pacing, or a minimum local closure proof.

## Agent Should

1. Treat the challenge as out of pure fast-lane discovery mode.
2. Restrict the active queue to calibration and closure-relevant actions only.
   Stop broad family exploration.
3. Confirm exact offset/control width.
4. Check preserve/no-write region if parser/copy behavior exists.
5. Use `ctf-pwn-gdb-snapshot` or tightly controlled runner iterations when runtime behavior is the bottleneck.
6. Use `ctf-pwn-experiment-ledger` packets instead of bloated probe-by-probe prose.
   Maintain a Calibration Ledger and change one variable at a time.
7. Prefer a minimum local closure proof before broader gadget exploration.
8. Record compact experimental deltas instead of growing long prose notes every step.
9. If two successive top branches are flat, emit a continue/suspend/handoff checkpoint rather than another long maintenance pass.

## Agent Should Not

- Re-open broad exploit family exploration after control is already proven.
- Spend more time re-ranking than running the next one-variable experiment.
- Treat parser-side effects as minor details.
- Continue narrative-heavy state refresh on every probe.

## Success Signal

- Offset/control width is explicit.
- Preserve-region or parser blocker is understood.
- Minimum local closure proof exists.
- Next closure step is concrete and evidence-backed.
- If not yet solved, a compact contest checkpoint is ready for resume or suspend.
