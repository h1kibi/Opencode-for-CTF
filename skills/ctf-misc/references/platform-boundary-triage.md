# Platform Boundary Triage

## Triggers

Use this compact reference when Misc evidence points toward DNS, Linux host behavior, game/VM state, or RF/SDR rather than a pure puzzle or encoding chain. It is a classifier aid, not a replacement for the owning specialist skill.

## First Discriminator

Preserve the source and run only the smallest probe that separates hypotheses:

| Shape | First discriminator | Record |
| --- | --- | --- |
| DNS | authoritative answer, record type/TTL, resolver path, and ownership of the queried name | exact query, answer, source, retrieval time, and whether it is challenge-controlled; use `dnspython -> dig -> nslookup` |
| Linux boundary | uid/gid/groups, cwd, mounts, namespaces, capabilities, service/cron ownership, and environment source | command, identity, file mode/owner, namespace, and reproducible effect |
| Game / VM | state variables, legal transitions, reset semantics, input parser, and win predicate | one transition trace and the condition that changes state |
| RF / SDR | sample rate, center frequency, bandwidth, IQ format, gain, channelization, and demodulation assumption | raw capture hash plus every conversion parameter |

Do not treat a DNS record, root-looking prompt, VM memory string, or decoded waveform as a solve without ownership and verification evidence.

## Boundary Rules

- DNS reachability or a TXT record is not authority; preserve resolver and authoritative provenance before using it. On Windows, `nslookup` is an acceptable last-resort resolver fallback when `dig` is absent.
- Local `uid=0`, a readable root-owned file, or a service name is not privilege escalation; confirm the execution boundary and a reproducible effect.
- A game/VM memory value is not a win; drive the state machine or invoke the native win checker.
- A demodulated phrase is not a message of record until it is reproducible from the raw samples and framing.

## Handoff Map

- DNS becomes a web/service or zone-transfer problem: hand off to `ctf-web`.
- Linux service, SUID, capability, or kernel boundary becomes decisive: hand off to `ctf-pwn` or the relevant host post-exploitation skill.
- Game/VM bytecode or checker logic dominates: hand off to `ctf-rev`.
- Raw media, signals, or packet reconstruction dominates: hand off to `ctf-forensics`.
- Mathematical decoding dominates: hand off to `ctf-crypto`.

## Evidence and Flag Boundary

Keep `shape`, `owner`, `firstProbe`, `source`, and `confidence` in notes. Apply `ctf-common/references/flag-identification-rules.md`; a DNS TXT value, memory string, or waveform output is at most an `untrusted_hint` or `flag_candidate` until an independent exact/file/service oracle passes. Do not write `agent_flag.txt` from a classifier result.

## Stop Rules

Stop or reclassify when the first discriminator does not isolate a family, the source is not preserved, or the next step would require broad unbounded probing. Misc should hand off rather than accumulate specialist payload libraries.
