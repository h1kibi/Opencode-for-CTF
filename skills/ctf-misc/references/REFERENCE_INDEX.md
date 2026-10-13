# Misc Reference Index

Use this file as the top-level trigger map for `skills/ctf-misc/references/`. Keep the misc skill thin and start with `ctf-misc-analyze`; route by challenge shape, not by habit.

## Classification / First Pass

- mixed or ambiguous challenge triage
  - `misc-fallback-matrix.md`

## Encoding / Transform Chains

- reversible transform stacks, layered encodings, and decode validation
  - `encoding-transform-chain.md`

## Protocol / Client Challenges

- small custom protocols, scripted clients, and grammar capture
  - `protocol-client.md`

## Jail / Sandbox Challenges

- Python/object-graph jail probing and bounded escape reasoning
  - `python-jail.md`

## Platform Boundary Triage

- DNS provenance, Linux identity/service boundaries, game/VM state, and RF/SDR assumptions
  - `platform-boundary-triage.md`

## Multimodal Media

- images, videos, audio, QR/barcode, OCR, waveform, and spectrogram evidence
  - `multimodal-media-triage.md`

## Misc Sub-shapes

- OSINT clue tables, public-source verification, and provenance
  - `../../ctf-misc-osint/SKILL.md`
- DNS record probing and bounded resolver fallbacks (`dnspython -> dig -> nslookup`)
  - `ctf-dns-probe`
- QR/barcode decoding with provenance-preserving fallback
  - `ctf-qr-probe`
- AI/ML model and agent challenge boundaries
  - `../../ctf-misc-ai-ml/SKILL.md`
- games, VMs, RF/SDR, DNS, and other external playbooks
  - retrieve with `ctf_rag` using the shape-specific technical anchors

## Classifier Output Map

`ctf-misc-analyze` emits `schemaVersion: "misc_analyze.v2"`. Use `shape` to select the narrowest route:

| Shape                                 | First route                                               | Ownership note                                                                         |
| ------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `layered_encoding`                    | `encoding-transform-chain.md` → `ctf-encoding-chain`      | Keep Misc ownership; pass text content and verify every layer.                         |
| `python_jail`                         | `python-jail.md` → bounded `ctf-python-inline` probe      | Map capabilities before payload work.                                                  |
| `custom_protocol` / `programming_ppc` | `protocol-client.md` → minimal client / `ctf-proto-probe` | Capture one grammar/transcript before looping.                                         |
| `game_state_machine`                  | external games/VM playbook                                | Model states and reset behavior first.                                                 |
| `osint`                               | corresponding clue/provenance playbook                    | Keep source, retrieval date, and confidence.                                           |
| `dns`                                 | `ctf-dns-probe` + platform boundary playbook              | Query only implied types; preserve resolver, TTL, and exact answer.                    |
| `qr_barcode`                          | `ctf-qr-probe`                                            | Preserve raw image and decoder provenance; decoded text is not a verified flag.        |
| `rf_sdr` / `ai_ml`                    | media, signal, or model playbook                          | Preserve raw artifact and assumptions; hand off if evidence becomes specialist-shaped. |
| `unknown`                             | `misc-fallback-matrix.md`                                 | Run one bounded probe, then reclassify.                                                |

A high-confidence web/pwn/rev/crypto/forensics result takes precedence over the Misc shape keyword and should be handed off.

## Trigger Rules

- If the challenge is mostly reversible transforms, start with `encoding-transform-chain.md`.
- If the challenge is mostly interactive grammar/state, start with `protocol-client.md`.
- If the challenge is a sandbox/jail, start with `python-jail.md`.
- If evidence points to DNS, Linux host behavior, game/VM state, or RF/SDR, load `platform-boundary-triage.md` for one discriminator before specialist handoff.
- If the real family becomes obvious, hand off to web/pwn/rev/crypto/forensics immediately.

## Environment Contract

Run `ctf-misc-env-check` before dependency-sensitive routes. Use `requirements-misc.txt` only as a route-specific source of optional Python fallbacks; external tools such as `ffmpeg`, `zbarimg`, `dig`, `tshark`, `ExifTool`, `gcc`, and SDR utilities remain platform-managed. A `degraded` capability must select a documented fallback, not trigger an unbounded installation or retry loop.

## Maintenance Rule

When adding a new Misc reference, update this index with:

- trigger evidence
- owning sub-shape
- whether it is classifier support, transform support, or a specialist fallback
