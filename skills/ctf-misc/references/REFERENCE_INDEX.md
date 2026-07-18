# Misc Reference Index

Use this file as the top-level trigger map for `skills/ctf-misc/references/`. Keep the misc skill thin and route by challenge shape, not by habit.

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

## Trigger Rules

- If the challenge is mostly reversible transforms, start with `encoding-transform-chain.md`.
- If the challenge is mostly interactive grammar/state, start with `protocol-client.md`.
- If the challenge is a sandbox/jail, start with `python-jail.md`.
- If the real family becomes obvious, hand off to web/pwn/rev/crypto/forensics immediately.

## Maintenance Rule

When adding a new Misc reference, update this index with:

- trigger evidence
- owning sub-shape
- whether it is classifier support, transform support, or a specialist fallback
