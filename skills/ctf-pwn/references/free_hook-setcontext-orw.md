# free_hook-setcontext-orw

Canonical source: `../../../knowledge/pwn/closure/free_hook_setcontext_orw.md`

## Query Aliases
- free_hook setcontext orw
- __free_hook setcontext+53
- setcontext orw
- closure router setcontext

## Trigger
- context restore route is available
- ORW is shorter than shell
- write primitive can reach hook or stable frame placement

## First Safe Check
- check glibc version + writable frame placement + ORW viability

## Stop Rule
- if frame placement or trigger cannot be proven quickly, rerank to direct ORW or output-hijack closure
