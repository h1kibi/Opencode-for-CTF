# Flag Identification Rules

This is the default cross-category flag decision contract. It reduces false positives; it does not replace an independent challenge oracle.

## Default decision ladder

```text
untrusted hint -> accepted candidate -> oracle-verified final flag
```

- A regex hit is never platform-level success by itself.
- `agent_flag.txt` may contain only an `oracle-verified` value.
- If the challenge explicitly documents a different format, pass an explicit `flagPattern` or record the user-provided exception; do not silently weaken the default rule.

## High-confidence candidates

Accept as a default candidate only when all conditions hold:

- Shape is `prefix{payload}`.
- Prefix is 3–10 ASCII letters/digits, case-insensitive; usual examples are `flag`, `ctf`, `CTF`, or an event abbreviation.
- Payload is 10–60 characters and contains only ASCII letters, digits, `_`, `-`, `@`, or `!`.
- No spaces, tabs, carriage returns, or newlines occur inside the braces.

A UUID payload such as `flag{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}` is a high-confidence candidate when it matches the UUID shape.

## Medium-confidence hash candidates

A bare 32-hex MD5 or 64-hex SHA-256 is **not** a flag by default. Accept it only when the same evidence includes an explicit flag source, for example:

- a path or file name containing `flag`, `.flag`, `flag.txt`, or a flag helper such as `readflag`/`getflag`;
- a command or output context such as `cat /flag`, `type /flag`, `Get-Content /flag`, `strings /flag`, or equivalent.

The words `hash`, `digest`, `checksum`, or a random hexadecimal string are insufficient.

## Rejection and verification

- Reject short examples such as `flag{ok}`, `flag{test}`, `flag{decoy}`, and `flag{real}` under the default format. They may still be used in tests or exact-oracle checks.
- Reject whitespace, multiline, malformed, bracketless, and generic-secret matches.
- A custom pattern is an explicit challenge exception and yields candidate evidence only unless an independent exact/file/hash oracle verifies it.
- Record `value`, `confidence`, `kind`, `reason`, and `source/origin/context` for every accepted candidate.

## Runtime tool output contract

When a tool reports a flag-shaped value, normalize its result as evidence rather than success:

- `verdict: flag_candidate` means one or more candidates were observed; it does not solve the challenge.
- `candidate_status: pending_oracle` means an independent verifier is still required.
- `direct_solve: no` must remain `no` for scanners, recon maps, source maps, string probes, packet probes, and shell runners.
- `oracle_verified: true` and `verified_flag` are reserved for a tool that actually checked the exact value against an independent challenge/file/hash oracle.
- Keep the value plus `source`, `origin`, `context`, `confidence`, `kind`, and `reason`; preserve URL, file path/line, frame/stream, command, or transcript location where available.
- `flag_detected`, `flags_found`, `flag_hits`, and custom-pattern matches are compatibility/evidence fields only unless an explicit oracle field also says `oracle-verified`.

## Agent procedure

1. Search challenge output, files, HTTP responses, terminal output, and recovered artifacts with the strict extractor.
2. Keep only the first-seen deduplicated candidates and retain their source context.
3. Separate `rejected` hints from accepted candidates; do not report rejected hashes as flags.
4. Check one independent oracle when available: exact expected value, challenge validator, justified flag file, or expected SHA-256.
5. On verification, write the exact value to `agent_flag.txt`, record the shortest reproducible path, and stop broad exploration.
