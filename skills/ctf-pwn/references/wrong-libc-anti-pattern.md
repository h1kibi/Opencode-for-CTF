# Wrong libc anti-pattern for heap verification

Canonical source: `../../../knowledge/pwn/anti-patterns/wrong-libc-anti-pattern.md`

## Query Aliases
- wrong libc
- wrong libc anti-pattern
- wrong base validation
- heap verification wrong libc

## Trigger
- bundled libc exists
- local heap behavior disagrees across bases
- overlap or tcache reasoning depends on a generic runtime

## First Safe Check
- stop mutation and run `ctf-pwn-libc-runtime-doctor`

## Stop Rule
- do not trust previous heap observations until the runtime is relocked
