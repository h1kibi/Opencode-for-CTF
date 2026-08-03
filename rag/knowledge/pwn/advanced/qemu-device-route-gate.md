# Card: pwn.advanced.qemu_device_route_gate

## Trigger Signals
- custom QEMU device
- MMIO/PIO/DMA interface
- guest-to-host boundary
- device state object

## Core Idea
Model device registers, DMA buffers, and host object before exploitation.

## Minimal Probe

```text
map MMIO/PIO operations
prove OOB/read/write in device state
pivot to host leak/control
```

## Confirm Oracle
Host/device primitive changes observable state or leaks host pointer.

## Falsify Oracle
No reachable device bug or guest isolation prevents primitive.

## Common Targets
- Version/runtime-specific.

## Closure Paths
- pwn.advanced.kernel_uaf_route_gate

## Version / Mitigation Notes
Requires controlled VM harness and snapshots.

## Pitfalls
- treating device PWN as normal ELF
- not modeling DMA address translation

## Anti-patterns
- Do not apply this advanced card before simpler primitive cards are falsified or blocked.

## Related Cards
- pwn.advanced.kernel_uaf_route_gate

## Example Micro-Challenges
- Add a minimal sample that isolates this trigger and its shortest probe.
