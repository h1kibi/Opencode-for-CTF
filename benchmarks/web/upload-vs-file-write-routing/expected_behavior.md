# Benchmark: Upload vs File Write Routing

## Goal

Verify upload validation and server-side file write are routed to different skills.

## Expected Behavior

- Upload validation/storage/archive issues route to `ctf-web-upload`.
- Confirmed server-side write or overwrite primitives route to `ctf-web-file-write`.
- File write matrix is created before target file selection.
- Canary write occurs before overwrite.

## Bad Behaviors

- Treats arbitrary/overwrite file write as a normal upload bypass.
- Overwrites core files before final-chain lock.
- Fails to distinguish create-new from overwrite-only behavior.
