# QEMU, Device, Hypervisor, and MMIO PWN Routing Card

Use when evidence contains QEMU device models, PCI/MMIO/PIO regions, virtio, hypercalls, KVM, VMM, guest-to-host escape, custom kernel/hypervisor layers, port I/O (`in`/`out`), or device state-machine bugs.

Imported references:
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\kernel-techniques.md`
- `{env:OPENCODE_CONFIG_DIR}\skills-external\ctf-skills\ctf-pwn\advanced.md`

## Route Gate

Collect these facts before exploitation:

| Fact | Why |
|---|---|
| QEMU command line | device model, memory size, sharing, network, debug flags |
| Device type | PCI, virtio, MMIO, PIO, custom hypercall, emulated peripheral |
| I/O region | BAR, port range, MMIO base, command registers |
| Guest artifact | userland binary, kernel module, driver, kernel image |
| Host/device source | handlers, state structs, DMA paths, bounds checks |
| Feedback channel | guest stdout, device response, shared folder, network |

## First Safe Checks

1. Map device registration and I/O handlers: `read`, `write`, `mmio_read`, `mmio_write`, `pio_read`, `pio_write`, DMA callbacks.
2. Identify attacker-controlled fields that cross the guest/host boundary: length, offset, index, descriptor count, address, command opcode.
3. Build a tiny guest-side client that performs benign read/write to the device.
4. Confirm one observable state change before mutating sizes or descriptors.

## Common Device Bug Families

- Bounds check on offset but not `offset + length`.
- Signed/unsigned length mismatch in DMA or descriptor processing.
- Guest physical address trusted without full translation/range check.
- Ring/descriptor index wraparound.
- Reset path leaves stale host pointer or stale length.
- Use-after-free across device reset/unplug/reconfigure.
- Hypercall whitelist applies only to user mode but not guest kernel mode.
- Host pointer leak through uninitialized device state.

## Primitive Ladder

1. Guest can reach device/hypercall.
2. Device state or memory leak confirmed.
3. OOB/overflow/UAF/write primitive proven on harmless device state.
4. Host address or module base recovered if needed.
5. Closure target chosen: host function pointer, vtable, callback, QEMU object, GOT/PLT, or data-only file/output path.
6. Guest-to-host flag exfil channel verified.

## Closure Preference

1. Device data-only output/readback path to host flag or shared file.
2. Host-side function pointer/callback overwrite if stable.
3. QEMU object/vtable corruption.
4. DMA arbitrary read/write to host process memory.
5. Guest kernel pivot to hypercall path only if the challenge stacks user -> kernel -> hypervisor.

## Hard Brakes

- Do not fuzz MMIO/PIO broadly before state-machine mapping.
- Do not assume guest virtual == guest physical == host pointer.
- Do not chase host RCE if a host-file readback or device output path can reveal the flag.
- Keep guest/client code reproducible; final solve should state QEMU command, guest binary path, and trigger order.
