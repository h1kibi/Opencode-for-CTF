# glibc 2.27 fake stdout to __free_hook setcontext ORW

Canonical source: `../../../knowledge/pwn/curated/glibc27-fake-stdout-shortplaybook.md` and `../../../knowledge/pwn/closure/free_hook_setcontext_orw.md`

## Query Aliases
- glibc 2.27 fake stdout
- setcontext+53
- fake stdout to __free_hook setcontext ORW
- short playbook glibc27 stdout

## Trigger
- glibc bucket 2.23–2.27
- fake stdout / `_IO_FILE` leakage is plausible
- `setcontext+53` or hook/context route may be shorter than shell

## First Safe Check
- confirm runtime bucket first, then choose between fake stdout first leak and direct setcontext/ORW closure

## Stop Rule
- if no concrete leak or closure differential appears quickly, rerank to the shorter closure family
