# UAF + Safe-Linking Reduction

## Trigger
- freed chunk leak or stale-reference leak
- 5-8 byte pointer-shaped output
- glibc >= 2.31 likely
- tcache / safe-linking likely relevant

## Goal
Convert a heap/UAF leak into heap classification, refill strategy, and the next primitive ladder step.

## First checks
1. identify the likely size class
2. confirm whether leaked bytes are user data, pointer, or safe-linked tcache fd
3. classify leak as heap / libc / PIE / stack / anonymous / unknown
4. check page alignment and high-byte stability
5. test whether `fd ^ (heap_base >> 12)` explains the next-pointer shape
6. identify a same-size refill sequence

## Heap Reduction Card fields
- stale object / field:
- freed chunk size class:
- leak class:
- candidate heap base:
- safe-linking status:
- same-size refill object:
- first AAR consumer:
- first AAW path:
- closure family if AAR/AAW succeeds:

## Primitive ladder
1. stale read confirmed
2. freed chunk contents leak classified
3. heap base or safe-linking key inferred
4. same-size refill proven
5. field overwrite or pointer reuse proven
6. AAR or AAW established
7. closure via ORW / FSOP / data-only output

## Good probes
- same-size rebuy after free
- compare two leak snapshots for high-byte and alignment stability
- inspect tcache bin / freelist shape after one controlled free
- prove whether a stale description/name pointer is printed or dereferenced

## Avoid
- discussing advanced heap technique names before allocator version, size class, and refill path are known
- using final base math from an unknown-class leak
- escalating to FSOP/ROP while still missing AAR/AAW proof

## Stop rule
If no same-size refill path or stale owner can be stated, do not keep payload mutating the same branch; reduce lifecycle evidence first.
