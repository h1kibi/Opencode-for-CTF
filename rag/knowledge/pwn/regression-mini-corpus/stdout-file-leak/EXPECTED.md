# stdout-file-leak

## Sample type

Metadata-only regression.

## Expected trigger signals

- stdout structure can be partially overwritten
- output path flushes stdout
- libc version/layout must be locked

## Expected primitive

- `pwn.primitive.stdout_file_leak`

## Anti-pattern to avoid

Do not copy FILE layout offsets across glibc versions without runtime lock.
