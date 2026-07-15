---
description: CTF PWN: Replay a real challenge failure against the current fast/rigorous toolchain
agent: ctf-pwn
subtask: false
---

Use this command when you want to replay a real PWN failure or near-miss against the current configuration and identify the first wrong branch, missing hard gate, or missing helper lock.

Context:
$ARGUMENTS

Replay workflow:
1. Identify whether the replay is primarily about:
   - bundled libc / substrate mismatch
   - menu/raw read contract drift
   - heap overlap mapping
   - remote drift
   - WP-vs-current chain mismatch
2. If bundled `libc.so.6` / `ld` exists, run `ctf-pwn-libc-runtime-doctor` before deeper replay.
3. If exact-length menu/raw evidence exists, run `ctf-pwn-menu-contract-probe` before replaying payload steps.
4. If overlap exists, run `ctf-pwn-heap-overlap-mapper` before offset mutation.
5. If a writeup excerpt is provided, run `ctf-pwn-wp-diff` and promote exactly one structural difference into the next replay probe.
6. Write a compact failure record using `templates/pwn_failure_signature.md` if the replay still fails.
7. Map the replay to the closest benchmark case under `benchmarks/pwn/`.

Output contract:
```text
PWN_REPLAY_PLAN
primary_replay_axis:
first_hard_gate:
first_helper_lock:
closest_benchmark_case:
best_next_probe:
if_still_fails_write:
```
