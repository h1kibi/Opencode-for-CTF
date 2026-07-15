# closure router: seccomp ORW / FILE / output-hijack

Canonical source: `../../../knowledge/pwn/closure/seccomp-closure-router.md`

## Query Aliases
- closure router
- seccomp closure router
- seccomp orw
- short playbook seccomp closure

## Trigger
- seccomp or sandbox evidence
- blocked shell
- ORW / existing fd / FILE leakage / output-hijack are competing closures

## First Safe Check
- run `ctf-pwn-syscall-orw-check` and compare shell vs direct read closure

## Stop Rule
- do not keep forcing shell once ORW, FILE, or output-hijack is clearly shorter
