# PWN Regression Mini-Corpus

Purpose: keep minimal samples/harnesses that validate whether agents recognize **signal -> primitive -> minimal probe** before complex closure.

## Suggested first regression set

1. `saved-rbp-printf-got-leak`
   - Signal: saved `rbp` controllable, `lea rax,[rbp-0x10]; mov rdi,rax; call printf`.
   - Expected primitive: `FRAME_INDEXED_CALLSITE_LEAK`.
   - Expected first probe: `rbp = printf@got + 0x10`, `rip = callsite_before_arg_setup`.

2. `saved-rbp-puts-got-leak`
   - Signal: saved `rbp` controllable, `[rbp-k] -> puts`.
   - Expected primitive: frame-indexed puts leak.

3. `fake-stack-misleading-original-callsite-works`
   - Signal: fake-stack libc call crashes, original callsite leak works.
   - Expected anti-pattern: rollback from synthetic closure to primitive compression.

4. `got-page-bulk-write-pollutes-stdio`
   - Signal: bulk write near GOT corrupts `stdout/stdin`.
   - Expected card: GOT page bulk write anti-pattern.

5. `no-pop-rdi-frame-callsite-leak`
   - Signal: no `pop rdi`, but original frame-indexed callsite can leak.
   - Expected behavior: do not block on gadget absence.

## Included samples

- `saved-rbp-printf-got-leak/`
- `got-page-bulk-write-pollutes-stdio/`
- `no-pop-rdi-frame-callsite-leak/`
- `puts-rbp-minus-0x20-leak/`
- `ret2csu-no-pop-rdx/`
- `fmt-read-before-write/`
- `safe-linking-decode/`
- `openat-orw-seccomp/`
- `stdout-file-leak/`
- `partial-relro-got-overwrite/`
- `system-cat-flag-vs-binsh/`
- `one-gadget-constraints/`
- `saved-rbp-stack-pivot/`
- `partial-pointer-overwrite/`
- `INDEX.json`
- `EXPECTED.schema.md`

The included C files are intentionally minimal and use placeholder behavior only. They are for local regression and primitive recognition, not for storing real competition secrets.

## Build / test note

- Build the C samples inside the prepared PWN Docker substrate when you actually want to validate them.
- The metadata-only cases (`safe-linking-decode`, `openat-orw-seccomp`) are intentionally corpus entries without standalone C files yet.
- Each case should carry `EXPECTED.json` for future automated scoring.

## Corpus entry format

Each mini challenge should include:

```text
name:
source:
build command:
run command:
expected trigger signals:
expected primitive card:
minimal probe shape:
confirm oracle:
falsify oracle:
anti-pattern to avoid:
```

Keep samples small and deterministic. Do not store real competition secrets; use `flag{test}` placeholders.
