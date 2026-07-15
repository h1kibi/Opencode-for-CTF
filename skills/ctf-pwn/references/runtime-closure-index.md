# PWN Runtime / Closure Index

Use this reference before longer route docs when the question is about runtime lock, bundled libc, exact read contracts, or shortest closure selection.

## Highest Priority Cards

- `pwn-mode-boundary.md`
  - trigger: fast lane or rigorous, controller versus executor, handoff threshold
  - first safe check: classify whether the next best action is exploit iteration or branch control

- `pwn-runtime-trigger-matrix.md`
  - trigger: repeated helper mentions, runtime doctor, menu contract, redflag, remote drift
  - first safe check: pick exactly one helper before more payload mutation

- `../../../knowledge/pwn/runtime/bundled-libc-first.md`
  - trigger: bundled libc, bundled ld, wrong libc, wrong base, heap pollution
  - first safe check: `ctf-pwn-libc-runtime-doctor`

- `../../../knowledge/pwn/runtime/glibc-version-route-map.md`
  - trigger: glibc version, hooks, safe-linking, FSOP, setcontext, version-gated heap
  - first safe check: `ctf-pwn-libc-resolver` + `ctf-pwn-libc-fingerprint`

- `../../../knowledge/pwn/runtime/exact-read-contracts.md`
  - trigger: `read(size+1)`, exact-length reads, mixed menu/raw, prompt pollution
  - first safe check: `ctf-pwn-menu-contract-probe`

- `../../../knowledge/pwn/curated/glibc27-fake-stdout-shortplaybook.md`
  - trigger: glibc 2.27, fake stdout, `_IO_FILE` leak, short closure needed
  - first safe check: runtime + leak class confirmation

- `../../../knowledge/pwn/closure/free_hook_setcontext_orw.md`
  - trigger: free-hook or context restore route, ORW shorter than shell
  - first safe check: glibc version + writable frame placement

- `../../../knowledge/pwn/closure/seccomp-closure-router.md`
  - trigger: seccomp, sandbox, syscall allowlist, blocked shell
  - first safe check: `ctf-pwn-syscall-orw-check`

- `../../../knowledge/pwn/anti-patterns/pwn-anti-patterns.md`
  - trigger: wrong libc, helper drift, route churn, long-doc drift
  - first safe check: compare current probe against the stop rule in the anti-pattern

## Retrieval Rule

If a query mentions any of these phrases, load this index first:

- bundled libc first
- wrong libc
- wrong base
- exact read size+1
- read(size+1)
- menu contract
- fake stdout
- setcontext+53
- seccomp closure
- anti-pattern

## Next Probe Rule

This index must answer:
1. what runtime lock is missing?
2. what helper contract is untrusted?
3. what closure family is shortest right now?
4. what anti-pattern should be killed?
