# Go / Rust Binary RE

Use when a native binary is compiled from Go or Rust and runtime/framework noise obscures the checker.

## Triggers

- Go strings, `runtime.main`, `main.main`, `.gopclntab`, Go build info.
- Rust symbols, panic strings, `core::`, `alloc::`, mangled names, iterator-heavy code.
- Large statically linked binary with rich string metadata and noisy runtime paths.

## First Safe Checks

1. Identify language/runtime and locate user entrypoint (`main.main`, demangled Rust main, exported target).
2. Search success/failure strings, panic messages, format strings, and flag fragments.
3. Use string xrefs/call graph to jump from runtime noise to custom validation.
4. Extract constants/tables from rodata; ignore runtime allocator/formatting boilerplate.
5. Rebuild only the checker slice in `solve.py`.

## Runtime Noise Filter

| Signal | User Code? | Runtime Noise? | Next Action |
|---|---|---|---|

## Stop Rules

- Do not start at raw `main` and read through runtime startup.
- Do not reverse panic formatting or allocator paths unless they carry validation state.
- If symbols are stripped, use strings/xrefs and compare/import-like patterns first.
