# Card: pwn.heap.house_of_apple2

## Trigger Signals
- modern glibc FILE surface
- _IO_wfile_jumps / wide_data path
- arbitrary write / fake FILE
- exit/flush trigger

## Core Idea
Modern FSOP technique using wide FILE fields to gain control despite vtable checks.

## Minimal Probe

```text
craft fake FILE/wide_data
point target FILE fields to fake structures
trigger flush/exit
```

## Confirm Oracle
Control reaches chosen call path or leaks via FILE path.

## Falsify Oracle
FILE checks fail or wrong version layout.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.heap.fsop_modern_glibc
- pwn.version.glibc_2_35

## Version / Mitigation Notes
Version-specific; verify against exact libc.

## Pitfalls
- copying writeup offsets across libc versions
- skipping FILE field sanity checks

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.heap.fsop_modern_glibc
- pwn.version.glibc_2_35

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
