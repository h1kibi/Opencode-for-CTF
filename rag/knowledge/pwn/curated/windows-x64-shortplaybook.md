# Windows x64 Short Playbook

## Trigger

Use this card when the target is native Windows PE/x64 and the branch is still in classic userland memory corruption territory.

## First Safe Check

1. Confirm PE/x64 and basic mitigations.
2. Identify whether the route is stack control, SEH-like, heap, format-like, or logic/data-only.
3. Prefer direct closure paths over Linux-style libc habits.

## Route Pressure

- Promote import-based API routing and data-only closure before shell aesthetics.
- Treat glibc/ELF assumptions as irrelevant.
- Prefer short reproducible local proof before remote or service adaptation.

## Stop Rule

If the branch depends on Linux/ELF runtime assumptions, stop and reroute immediately.
