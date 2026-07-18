# Benchmark: Ret2win Basic

## Goal

Ensure a simple direct-control PWN branch stays on the shortest closure path instead of expanding into unnecessary leak or heap routes.

## Expected Behavior

- Record binary triage and protection summary before exploit selection.
- Identify the branch as a direct or shortest ret2win-style closure opportunity.
- Prefer the smallest matching exploit sketch or template before building extra route complexity.
- Verify the exploit locally and record the shortest closure path to the flag.

## Bad Behaviors

- Opens heap or libc-heavy branches before checking direct closure.
- Builds long gadget chains before proving the direct route is blocked.
- Claims success without a reproducible exploit script.
