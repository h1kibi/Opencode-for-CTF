# glibc Version Uncertainty Routing

Use when exploit route depends on libc symbols, one_gadget, heap hooks, allocator behavior, tcache/safe-linking, or remote environment.

## First Signals

- Bundled libc/ld present.
- Dockerfile pins distro/glibc.
- Local host libc differs from challenge.
- one_gadget or hook targets considered.
- Heap technique depends on version.
- Remote exploit fails after local success.

## Version Sources by Reliability

1. Bundled `libc.so.6` and `ld-linux*`.
2. Challenge Dockerfile / docker-compose image.
3. Remote leak matched to libc database, only after strong symbol pair.
4. Local system libc, only if challenge clearly uses host local runtime.
5. Guessing by Ubuntu version, weak unless Docker confirms.

## Mandatory Tooling

- Use `ctf-pwn-libc-resolver` when bundled libc exists.
- Use `ctf-pwn-docker-harness` when Docker/libc/ld artifacts exist.
- Use `ctf-pwn-remote-drift-check` when local success diverges from remote.

## Route Effects

| Version Gate | Routing Impact |
|---|---|
| glibc <= 2.23 | old fastbin/unsafe unlink/hooks viable |
| glibc 2.26+ | tcache exists |
| glibc 2.32+ | safe-linking likely affects tcache poisoning |
| glibc >= 2.34 | malloc/free hooks not primary targets |
| different ld | ROP/one_gadget/environment may drift |

## False Positives

- One libc leak alone may match multiple versions.
- one_gadget output is not a plan without constraints.
- Hook symbol existing in a database is irrelevant if actual runtime is >= 2.34 or target unreachable.
- Docker image tag is weaker than the actual provided libc.

## First Safe Probes

1. Hash and resolve bundled libc.
2. Verify leaked symbol offset against that libc.
3. Sanity-check computed base range.
4. Confirm final symbol/gadget address from runtime leak.
5. If remote differs, collect a second leak or use provided remote libc hint before roulette.

## Stop / Pivot Rule

Do not rotate libc versions after two failed guesses. Acquire a stronger leak, Docker evidence, or choose a version-independent closure route.

## Query Terms

glibc version pwn routing, libc mismatch remote, safe-linking glibc 2.32, glibc 2.34 no hooks, one_gadget constraints libc
