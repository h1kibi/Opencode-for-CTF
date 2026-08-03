# Card: pwn.advanced.kernel_uaf_route_gate

## Trigger Signals
- kernel module/device/ioctl
- UAF/refcount/double free
- KASLR/SMEP/SMAP/KPTI
- cred overwrite or ROP target

## Core Idea
Kernel PWN needs interface/object lifetime/mitigation map before payload mutation.

## Minimal Probe

```text
map ioctl commands and object lifecycle
prove UAF read/write/control
choose cred overwrite or kROP bypass path
```

## Confirm Oracle
Kernel primitive proven without panic or with controlled panic oracle.

## Falsify Oracle
No reachable UAF/lifetime bug or mitigation path impossible.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.advanced.qemu_device_route_gate

## Version / Mitigation Notes
Use QEMU/snapshot; avoid destructive host actions.

## Pitfalls
- userland ret2libc habits in kernel
- not separating kernel/user pointers

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.advanced.qemu_device_route_gate

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
