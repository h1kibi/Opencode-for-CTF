# Bundled libc first: lock runtime before heap probing

Canonical source: `../../../knowledge/pwn/runtime/bundled-libc-first.md`

## Query Aliases
- bundled libc first
- runtime lock
- lock runtime before heap probing
- bundled ld first
- wrong base with bundled libc

## Trigger
- challenge ships `libc.so.6`
- challenge ships `ld-linux*`
- heap / overlap / tcache / FILE observations came from a generic base image

## First Safe Check
- run `ctf-pwn-libc-runtime-doctor`

## Stop Rule
- do not validate heap overlap, tcache, FILE, or seccomp closure on a mismatched base once bundled libc/ld is present
