# Exact read(size+1) menu desync contract

Canonical source: `../../../knowledge/pwn/runtime/exact-read-contracts.md`

## Query Aliases
- exact read
- size+1
- read(size+1)
- menu desync contract
- exact read contracts

## Trigger
- source or decompilation shows `read(size+1)` or exact-length raw reads
- menu prompts become polluted after payload delivery

## First Safe Check
- run `ctf-pwn-menu-contract-probe`

## Stop Rule
- do not keep flipping `sendafter` / `sendlineafter` until the helper contract is explicit
