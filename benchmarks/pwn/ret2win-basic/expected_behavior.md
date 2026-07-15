# Expected Behavior: ret2win-basic

## Scenario

Simple ELF with a buffer overflow, no canary, no PIE, and a reachable `win`, `print_flag`, or equivalent function.

## Agent Should

1. Use `ctf-pwn-fast` or fast lane first.
2. Stay inside the fast short-budget opener rather than building a full rigorous queue.
3. Run `ctf-binary-probe` on the ELF.
4. Check symbols/strings for direct win/flag/backdoor paths.
5. Run `ctf-pwn-crash-probe` to measure offset/control.
6. Use `ctf-pwn-fast-skeleton-hints` as soon as the route family is obviously ret2win/direct-control.
7. Build `exploit.py` quickly, preferably from `templates/solve_pwn.py` if non-trivial.
8. Use `ctf-pwn-rop-summary` only after control proof if needed.
9. Verify locally with `ctf-pwn-runner`.
10. Report flag and reproducible command.

## Agent Should Not

- Start with broad pattern search.
- Build a top-3 decision-state queue before trying direct win.
- Rotate libc or one_gadget.
- Use heap/seccomp tools without evidence.
- Spend fast-lane time writing large notes.
- Stay in fast mode after the task clearly stops being simple.
- Keep debating route families after a ret2win scaffold contract is already obvious.

## Success Signal

- Offset measured.
- Direct call/ROP to win works locally.
- `ctf-pwn-runner` reports flag or confirmed success oracle.
- If not solved, the handoff packet contains a compact `contest_meta` judgment instead of a retrospective.
