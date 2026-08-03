# Wrong Libc / Wrong Base Validation

## Trigger

Use this card when the challenge ships `libc.so.6` / `ld`, but validation started on a generic or mismatched base image.

## Symptom

- heap overlap boundaries look inconsistent
- tcache behavior changes between environments
- FILE / fake stdout facts seem unstable
- local proof on one base does not reproduce under bundled runtime

## Correct Action

1. stop heap/overlap mutation
2. run `ctf-pwn-libc-runtime-doctor`
3. relock the runtime
4. re-run only the minimum validation needed to restore trust

## Stop Rule

Do not use earlier heap observations as final truth once wrong-libc validation is confirmed.
