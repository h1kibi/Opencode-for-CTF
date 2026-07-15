# Kernel Route Gate

## Trigger

Use this card when the challenge involves kernel modules, `/dev/*`, `ioctl`, `eBPF`, KASLR, SMEP/SMAP, KPTI, or ring transitions.

## First Safe Check

1. Confirm it is truly kernel-owned, not a normal userland ELF.
2. Identify the interface: `ioctl`, read/write, netlink, procfs, eBPF, or device mapping.
3. Define one safe oracle before exploit mutation.

## Route Pressure

- Promote object/state model and privilege boundary first.
- Demote generic ret2libc/heap habits unless the kernel path is explicitly userland-mediated.

## Stop Rule

If the branch has no kernel interface model yet, do not mutate payloads further.
