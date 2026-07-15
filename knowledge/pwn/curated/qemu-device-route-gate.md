# QEMU Device Route Gate

## Trigger

Use this card when the challenge evidence points to QEMU devices, MMIO/PIO, DMA, virtio, hypercalls, or VMM state.

## First Safe Check

1. Confirm the interface: MMIO, PIO, ioctl bridge, virtio queue, shared memory, or hypercall.
2. Identify the object/state model before gadget thinking.
3. Define one safe oracle that changes device state, not just guest noise.

## Route Pressure

- Promote interface mapping and state transitions first.
- Demote generic userland ROP habits unless the device path explicitly falls back to userland closure.

## Stop Rule

If the device state model is still missing, stop and map the interface instead of mutating exploit payloads.
