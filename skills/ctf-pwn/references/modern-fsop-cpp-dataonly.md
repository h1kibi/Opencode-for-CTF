# Modern FSOP, C++ Object, and Data-Only Closure Routing Card

Use when evidence contains `_IO_FILE`, `_IO_2_1_stdout_`, `_IO_wfile_jumps`, FILE/vtable, glibc internals, C++ vtables, callbacks, function-pointer tables, object type confusion, adjacent global strings/paths/lengths, or controlled writes into long-lived memory.

Imported references:
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\heap-fsop.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\heap-techniques.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\heap-techniques-2.md`
- `C:\Users\Administrator\.config\opencode\skills-external\ctf-skills\ctf-pwn\advanced-exploits.md`

## Route Gate

Before naming a House/FSOP technique, collect:

| Fact | Why |
|---|---|
| glibc version | hooks, safe-linking, FILE layout, vtable validation |
| primitive shape | UAF, off-by-one, overlap, arbitrary write, partial write |
| target region | heap, libc FILE, `.bss`, C++ object, global table |
| consumer | flush, print, virtual call, callback, path read, length-based output |
| closure owner | source/data/output path vs control-flow hijack |

## FSOP Recognition

- Writable libc FILE structure reachable by heap overlap/fastbin/tcache/unsorted attack.
- stdin/stdout fields such as `_IO_buf_base`, `_IO_buf_end`, `_flags`, `_wide_data`, vtable pointer.
- Program triggers `printf`, `puts`, `exit`, `fflush`, `scanf`, `fgets`, or `_IO_flush_all_lockp`.
- Seccomp blocks shell but FILE path can pivot to ORW/mmap/write.

## Modern glibc Notes

- glibc 2.24+ validates FILE vtables; prefer valid vtable section pivots or wide-data subchains.
- glibc >= 2.34 removes common malloc/free hooks; do not default to `__free_hook`/`__malloc_hook`.
- Safe-linking requires heap leak or pointer mangling strategy before tcache poisoning.
- Wide FILE paths (`_IO_wfile_jumps`, `_wide_data`) may provide stack pivots or controlled indirect calls.

## C++ / Object Corruption Recognition

- Struct/class has data buffer followed by vtable/function pointer/callback/path/length.
- Type tag changed before virtual call or switch dispatch.
- Array index reaches object pointer table.
- Copy-by-value or shallow slice/map causes shared backing storage.
- Function pointer table null-checks entry but skips bounds check.

## Closure Preference

1. Data-only overwrite of flag path/string/length/output buffer if it directly prints or reads flag.
2. Existing callback/function pointer/vtable call with controlled first argument.
3. FILE field manipulation to leak/write/pivot.
4. FSOP to ORW/read-flag under seccomp.
5. Full ROP/shell only if shorter data/output closure is blocked.

## Adjacency Audit Checklist

For any write into `.bss`, global, heap object, FILE-like structure, parser buffer, or class instance:

- Previous/next object.
- Later consumer function.
- Whether an existing output path prints controlled or adjacent bytes.
- Whether a path/length/state byte overwrite reads flag sooner than ROP.
- Whether two same-family closure probes failed; if so demote and re-rank.

## Hard Brakes

- Do not call a route FSOP until FILE structure reachability and trigger are proven.
- Do not use hook targets on glibc >= 2.34.
- Do not abandon data-only closure for shell aesthetics when output/read path exists.
- Do not trust vtable overwrite if CFG/CET/IBT or glibc validation blocks the target; choose valid call targets or data-only closure.
