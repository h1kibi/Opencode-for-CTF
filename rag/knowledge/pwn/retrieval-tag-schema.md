# PWN Card Tag Schema

Purpose: structure PWN knowledge cards for signal-based retrieval.

Each indexed card may expose these tag groups:

```yaml
id: pwn.primitive.example
path: knowledge/pwn/...
kind: primitive | closure | anti-pattern | runtime | mitigation | debug-oracle | advanced
control:
  - saved_rip
  - saved_rbp
  - stack_pivot
  - arbitrary_write
  - arbitrary_read
  - uaf
  - fmt
  - syscall
leak:
  - got
  - libc
  - stack
  - heap
  - file
  - uninitialized
callsite:
  - rbp_relative_arg
  - original_callsite
  - printf
  - puts
  - write
  - system
mitigation:
  - nx
  - pie
  - canary
  - partial_relro
  - full_relro
  - cet
  - ibt
  - shstk
  - seccomp
runtime:
  - glibc_2_23
  - glibc_2_27
  - glibc_2_31
  - glibc_2_32_plus
  - glibc_2_34_plus
  - glibc_2_35
  - glibc_2_39
  - musl
  - kernel
  - qemu
  - browser
closure:
  - ret2win
  - ret2libc
  - one_gadget
  - orw
  - system_cat_flag
  - shellcode
  - fsop
  - data_only
  - got_hijack
anti_pattern:
  - fake_stack_before_callsite
  - got_page_pollution
  - one_gadget_roulette
  - wrong_libc
  - shell_over_flag
  - write_before_leak
```

## Rules

- Tags describe observed evidence and primitive outputs, not only exploit names.
- A card can have multiple tag groups.
- The generated `card-tags.index.json` is an index, not the source of truth; Markdown cards remain authoritative.
- Do not put every card into high-rank pattern-card JSON. Use tags for focused retrieval and keep frontline ranking stable.
