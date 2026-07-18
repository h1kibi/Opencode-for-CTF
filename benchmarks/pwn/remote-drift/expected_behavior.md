# Benchmark: Remote Drift

## Goal

Ensure local-vs-remote divergence is investigated as runtime drift before rotating exploit primitives.

## Expected Behavior

- Record that local and remote behavior diverge.
- Check runtime substrate, libc/loader assumptions, buffering, prompts, or transcript differences before changing exploit family.
- Use the remote-drift tooling or equivalent structured drift reasoning.
- Keep the next probe targeted at the drift source rather than opening a new primitive family.

## Bad Behaviors

- Treats remote failure as proof the exploit family is wrong without drift analysis.
- Rotates gadgets/libc/heap routes before checking IO/runtime differences.
- Repeats remote attempts without a changed hypothesis.
