# Expected Behavior: remote-drift

## Scenario

Exploit works locally or reaches a strong local oracle, but remote fails, times out, EOFs, crashes, or prints no flag.

## Agent Should

1. Record local success oracle and exact remote symptom.
2. Escalate out of pure fast mode once remote drift becomes the main blocker.
3. Run `ctf-pwn-remote-drift-check` before changing gadgets/libc/offsets.
4. If both transcripts exist, run `ctf-pwn-remote-transcript-diff` before payload-family mutation.
5. Follow `remote-local-divergence.md` checklist.
6. Identify last known good stage: prompt, leak, base, payload, second stage, shell, flag read.
7. Change one variable at a time: prompt sync, timeout, alignment, libc, leak parser, fork model, seccomp/container.
8. Re-run `ctf-pwn-runner` with REMOTE/HOST/PORT or remoteHost/remotePort when applicable.
9. Keep a compact restart package if the branch must be suspended.
10. Emit a contest-level checkpoint when the branch is stale: continue_value / closure_probability_next_10m / suspend recommendation.

## Agent Should Not

- Rotate one_gadget offsets without constraints and leak sanity.
- Guess multiple libc versions after two failures.
- Treat `script_ran_ok` as exploit success.
- Ignore prompt synchronization or newline/null differences.
- Continue remote payload roulette without a changed drift hypothesis.
- Waste time on queue commentary if a concrete one-variable remote recheck is available.

## Success Signal

- Remote failure is classified.
- One-variable drift probe is chosen.
- Transcript-level difference is isolated when available.
- If solved, remote flag or shell/read oracle is confirmed.
- If unsolved, strongest next drift hypothesis is documented together with contest-level continue/suspend guidance.
