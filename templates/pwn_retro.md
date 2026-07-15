# PWN Retro Template

Use after every solved or failed PWN challenge. Keep sanitized: no private credentials, no out-of-scope secrets, no reusable live flags in knowledge notes.

## Challenge Summary

| Field | Value |
|---|---|
| challenge |  |
| event/source |  |
| category | pwn |
| difficulty guess | easy / medium / hard |
| local artifacts | ELF / libc / ld / Docker / source / none |
| remote | host:port / none |
| final status | solved / unsolved / blocked / escalated |
| flag verified | yes / no |
| exploit file | exploit.py / solve.py / work/last_attempt.py / none |

## Mitigation Matrix

| Arch | NX | PIE | Canary | RELRO | libc/ld | seccomp | stripped |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

## Route Timeline

| Order | Route / hypothesis | Evidence | Result | Keep / Kill / Pivot reason |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |

## Final Primitive

| Field | Value |
|---|---|
| bug class | BOF / fmtstr / heap / shellcode / ORW / logic / other |
| input surface | stdin / argv / menu / socket / file / other |
| parser/state |  |
| primitive | RIP control / leak / arbitrary write / UAF / file read / other |
| proof oracle | crash / debugger / leak / shell / flag / file output |
| final closure | ret2win / ret2libc / ORW / fmt-write / heap target / direct read |

## Important Numbers

| Item | Value | Source |
|---|---|---|
| offset |  |  |
| canary | sanitized / not stored |  |
| PIE base | sanitized / not stored |  |
| libc base | sanitized / not stored |  |
| heap base | sanitized / not stored |  |
| key gadget/symbol |  |  |

## Local / Remote Drift

| Field | Value |
|---|---|
| local success oracle |  |
| remote symptom |  |
| drift cause | prompt / newline / timeout / libc / ld / alignment / fork / seccomp / flag path / unknown |
| drift fix |  |
| remote verified | yes / no / untested |

## Wrong Branches and Failure Signatures

| Branch | Failure signature | Lesson |
|---|---|---|
|  |  |  |

Common failure tags:
- `pwn-blind-remote-before-local-oracle`
- `pwn-heap-technique-before-menu-state`
- `pwn-movaps-alignment`
- `pwn-partial-control-treated-as-full-rce`
- `pwn-shell-obsession-before-flag-read`
- `pwn-version-roulette-before-route-gating`

## Pattern Feedback

| Pattern / reference | Result | Evidence | Action |
|---|---|---|---|
| pwn-route-matrix.md | confirmed / weak / misleading / skipped |  | keep / update |
| heap-version-route-matrix.md | confirmed / weak / misleading / skipped |  | keep / update |
| leak-to-primitive-ladder.md | confirmed / weak / misleading / skipped |  | keep / update |
| remote-local-divergence.md | confirmed / weak / misleading / skipped |  | keep / update |
| seccomp-sandbox-closure.md | confirmed / weak / misleading / skipped |  | keep / update |

## Knowledge Update Candidates

| Candidate note | Why | Priority |
|---|---|---|
|  |  | high / medium / low |

## Exploit Reliability Checklist

- [ ] `exploit.py` or `solve.py` supports LOCAL/REMOTE.
- [ ] HOST/PORT can be overridden.
- [ ] libc/ld path is explicit if relevant.
- [ ] Prompt sync is deterministic.
- [ ] Leak parsing is byte-safe.
- [ ] Stack alignment checked if ret2libc/ROP.
- [ ] `ctf-pwn-runner` or equivalent final oracle was used.
- [ ] Final report distinguishes `script_ran_ok`, shell, flag, crash, timeout.

## One-line Reusable Lesson

Write one sanitized lesson suitable for future ranking:

> 
