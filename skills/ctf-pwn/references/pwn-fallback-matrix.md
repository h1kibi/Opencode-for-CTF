# Pwn Fallback Matrix

Use this when a pwn branch stalls. Pick exactly one fallback that changes the evidence, not another same-family payload variant.

| Failed Stage | Symptom | Fallback | Stop / Pivot Rule |
|---|---|---|---|
| Triage | `ctf-binary-probe` lacks enough context | Inspect source/Docker/libc, rerun file/protection summary only if artifact changed | If no native binary or service exists, route out of pwn |
| Protocol | Payloads do not reach vulnerable code | Script normal interaction with pwntools, record menu states and prompts | If parser state is unknown after two attempts, build a state table before more payloads |
| Crash | No crash or unstable crash | Check input length limits, newline/null handling, argv/env/file input, timeout, and Docker runtime | After 3 variants with no new behavior, pivot to source audit or logic bug |
| Control | Crash exists but RIP/EIP/control not proven | Generate cyclic pattern, inspect register/stack/core with gdb batch | Do not build ROP until offset/control is measured |
| Leak | ASLR/PIE/libc needed but no leak | Search format string, puts/write primitive, GOT/PLT, stack leak, heap/libc pointer in show path | After 3 leak attempts without stable pointer, rerank to non-leak route or info disclosure source |
| Mitigation | Canary/PIE/NX/RELRO blocks route | Recompute primitive need: canary leak, PIE leak, ret2csu, ORW, SROP, GOT write only if RELRO allows | Do not rotate gadgets without a verified base |
| Heap State | Heap technique unclear | Build alloc/free/edit/show table, chunk sizes, libc version, tcache limits, primitive proof | Do not try named houses before primitive and version evidence |
| Seccomp | Shell fails | Run/inspect seccomp rules; switch to ORW or allowed-syscall ROP | If open/read/write unavailable, look for existing file-printing function or logic route |
| Remote Drift | Local works, remote fails | Verify libc/ld, buffering, timeout, newline, PIE base assumptions, remote prompt sync | Do not brute-force remote variants without a changed hypothesis |
| Final Reliability | Flag path flaky | Add deterministic receive/send, leak parsing checks, retries only for network instability | Stop after one verified flag; write `agent_flag.txt` |

High-information fallbacks:

- Source audit beats blind payload mutation when source exists.
- Core/gdb register evidence beats guessing offsets.
- Menu state table beats heap technique guessing.
- Seccomp rule evidence beats trying `/bin/sh` variants.
- Libc/base proof beats one_gadget rotation.
