# PWN Retrieval Fields

These fields should bias retrieval toward decision-ready, runtime-aware, closure-first cards.

## Preferred Fields
- `glibc_version`
- `arch`
- `primitive`
- `closure_family`
- `needs_libc`
- `seccomp_profile`
- `runtime_lock`
- `anti_patterns`

## Ranking Policy

Prefer results in this order:
1. curated short card matching current simple closure family + primitive
2. closure-ready card matching current branch blocker
3. runtime lock or anti-pattern card only when simple closure is blocked or polluted
4. long reference only when no short card can produce the next probe

## Retrieval Goal for `ctf-expert`

The best hit should answer:
- what mode does the current evidence most resemble?
- what is the shortest simple closure still alive right now?
- what must be true about runtime/version first?
- what is the next one-variable probe?
- what closure family is currently shortest?
- what anti-pattern should be avoided right now?
