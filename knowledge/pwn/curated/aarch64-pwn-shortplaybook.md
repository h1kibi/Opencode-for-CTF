# AArch64 PWN Short Playbook

## Trigger

Use this card when the binary or runtime is AArch64/ARM64.

## First Safe Check

1. Confirm the runtime and toolchain support AArch64.
2. Re-check calling convention and syscall ABI before importing amd64 assumptions.
3. Validate whether the shortest route is logic/data-only, ROP, or syscall/file-read.

## Route Pressure

- Promote ABI confirmation before gadget enumeration.
- Prefer direct closure and file-read routes when shell ergonomics are worse than the shortest read path.
- Treat amd64 gadget habits as anti-patterns unless explicitly proven equivalent.

## Stop Rule

If the route still relies on amd64 register/gadget assumptions, stop and restate the ABI first.
