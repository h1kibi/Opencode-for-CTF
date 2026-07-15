# Remote Local Divergence

Use when a local exploit or primitive works but the remote challenge fails, hangs, crashes early, or returns no flag.

## Drift Checklist Order

1. Prompt synchronization and menu state.
2. Newline, null byte, carriage return, EOF behavior.
3. Timeout, buffering, `send` vs `sendline`, delayed output.
4. Leak parsing and base sanity.
5. Binary hash mismatch.
6. libc/ld mismatch.
7. Stack alignment / `movaps`.
8. one_gadget constraints and clobbered registers.
9. Forking service behavior and ASLR reset model.
10. Environment variables, cwd, flag path, argv.
11. Seccomp/container profile differences.
12. Network truncation or interactive shell I/O issue.

## Mandatory Tool

Run `ctf-pwn-remote-drift-check` before rotating gadgets, libc versions, or one_gadget offsets.

## Evidence to Record

| Field | Example |
|---|---|
| local oracle | shell, flag, leak, crash, RIP control |
| remote symptom | timeout, EOF, crash, wrong leak, no shell |
| last known good stage | leak parsed, payload sent, second stage reached |
| suspected drift | libc, prompt, alignment, seccomp, fork |
| one changed variable | alignment ret, recvuntil, libc, timeout |

## Fast Fixes

- Add one `ret` for amd64 stack alignment when crash indicates `movaps`.
- Replace brittle `recvline` with delimiter-based `recvuntil` when prompt varies.
- Re-parse leaks from actual remote output bytes.
- Use REMOTE/HOST/PORT environment variables in exploit instead of hardcoding.
- Keep local and remote paths separated.

## False Positives

- `script_ran_ok` is not success.
- Remote EOF after payload is failure unless flag already printed.
- A shell prompt not detected may still be shell; use a safe `echo`/`id` oracle only in CTF scope.
- One successful local run is insufficient for heap/race/fork drift.

## Stop / Pivot Rule

After two remote mutations without a changed drift hypothesis, stop and remap the exact failed stage. Do not remote brute-force gadgets.

## Query Terms

pwn remote local drift, movaps ret2libc remote fails, pwntools prompt sync timeout, one_gadget constraints remote, libc mismatch remote
