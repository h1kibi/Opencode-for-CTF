# PWN Decision Card Template

Use this template when curating a high-value PWN card for `ctf-rigorous`.

## Metadata
- `glibc_version`:
- `arch`:
- `primitive`:
- `closure_family`:
- `needs_libc`:
- `seccomp_profile`:
- `runtime_lock`:
- `anti_patterns`:

## Trigger
- What concrete evidence should load this card?

## First Safe Check
- What is the first low-risk probe that confirms or rejects this route?

## Required Runtime / Version
- Which glibc / loader / base image / arch assumptions must be true first?

## Shortest Closure Pressure
- When is this route shorter than shell / ret2libc / fake FILE / ORW?

## Next Probe
- One variable only.
- Explicit oracle.
- Explicit falsify condition.

## Anti-Pattern
- What common misroute should this card prevent?

## Stop Rule
- Under what condition should the branch stop using this card and rerank?
