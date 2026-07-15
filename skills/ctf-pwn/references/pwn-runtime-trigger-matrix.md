# PWN Runtime Trigger Matrix

Use this reference to decide which runtime helper or probe should run before more payload mutation.

## Trigger Matrix

| Evidence | First Helper / Tool | Why It Comes First | Stop Mutating Until |
|---|---|---|---|
| bundled `libc.so.6` or `ld` | `ctf-pwn-libc-runtime-doctor` | avoids proving heap, overlap, or closure on the wrong base | runtime recommendation is recorded |
| challenge Dockerfile / compose / libc mismatch suspicion | `ctf-pwn-docker-harness` | picks the shortest reproducible substrate | active substrate is locked |
| chosen Docker / compose substrate | `ctf-pwn-container-probe` | verifies `python3`, `pwntools`, `gdb`, `checksec` before exploit drift | tool health is known |
| exact `read(size+1)` or mixed menu/raw phases | `ctf-pwn-menu-contract-probe` | locks helper semantics before payload retries | send/sendline contract is trusted |
| checker loop, explicit null termination, indexed writes | `ctf-pwn-redflag-panel` | checks disguised stack-smash or checker-style corruption pressure | red-flag family is accepted or killed |
| local works, remote fails | `ctf-pwn-remote-drift-check` | prevents gadget/libc roulette | drift class is named |
| local pipe / remote socket framing mismatch | `ctf-pwn-remote-transcript-diff` then `ctf-pwn-io-diff-check` | isolates pacing, fixed-read, EOF, padding, and prompt drift | transport contract is trusted |
| bundled libc and remote libc suspicion | `ctf-pwn-libc-fingerprint` + `ctf-pwn-libc-resolver` | clarifies version and offset assumptions | libc class is known |
| seccomp / blocked shell / static syscall route | `ctf-pwn-syscall-orw-check` | selects ORW/file-read before shell fixation | closure family is chosen |
| stale pointer + pointer-shaped leak + repeated allocator actions | `ctf-pwn-heap-menu-map` + `ctf-pwn-heap-reduction-check` | forces primitive reduction before naming techniques | heap primitive ladder advances |

## Interpretation Rules

- Helper choice is routing pressure, not proof.
- If a helper identifies a blocking uncertainty, fix that uncertainty before spending more same-family exploit attempts.
- If two helper-guided probes still produce no new oracle, escalate from fast mode or pivot to a genuinely different family.

## Related References

- `pwn-runtime-substrate-lock.md`
- `runtime-closure-index.md`
- `remote-local-divergence.md`
- `pwn-route-matrix.md`
