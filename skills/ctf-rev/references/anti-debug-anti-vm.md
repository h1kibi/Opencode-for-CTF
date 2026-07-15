# Anti-Debug / Anti-VM

Use when debugger, emulator, timing, ptrace, IsDebuggerPresent, CPUID, TLS callback, signal/exception, or Frida-detection logic blocks validation.

## Triggers

- `ptrace`, `sysctl`, `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`.
- `rdtsc`, sleeps, timing deltas, exception tricks, self-checksums, environment/process scans.
- Android root/emulator/Frida checks or suspicious `/proc` reads.

## First Safe Checks

1. Separate anti-analysis path from actual validation path.
2. Prefer static patch or targeted hook of the anti-analysis result, not broad bypasses.
3. Verify bypass reaches the same checker, not a fake success/decoy path.
4. Record the patch/hook address and original condition.

## Bypass Ledger

| Check | Address/Method | Expected Normal | Bypass | Validation Reached? |
|---|---|---|---|---|

## Stop Rules

- Do not spend dynamic effort before confirming the anti-analysis check blocks the validation path.
- Do not patch final compare to success unless the goal is only to expose intermediate values.
- If bypass changes checker semantics, revert and use tracing/stubbing instead.
