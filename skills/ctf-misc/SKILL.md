---
name: ctf-misc
description: Use for authorized miscellaneous CTF challenges that do not cleanly fit web, pwn, reverse engineering, crypto, or forensics and may require scripting, protocols, puzzles, jail escapes, games, blockchain, ML, or mixed techniques.
compatibility: opencode
---

# CTF Misc

## Purpose

Use this skill as a classifier and lightweight controller for mixed or ambiguous challenges.

## Scope

Use only on provided CTF/lab/local challenge files and authorized services.

## Contract

- Load `references/REFERENCE_INDEX.md` first when the challenge shape is unclear.
- Classify before heavy tools.
- Keep `notes.md` focused on evidence, eliminations, and the chosen route.
- Pivot quickly to web/pwn/rev/crypto/forensics once the real category is clear.

## Inputs

Collect:

- Challenge description, files, service protocol, interaction examples, constraints, and flag format.
- Initial category signals: encoding, archive, QR/barcode, audio, image, jail, programming, game, blockchain, ML, protocol, or mixed web/rev/crypto/forensics.

## Workflow

1. Classify the challenge before using heavy tools.
2. Inventory files and interaction method.
3. Pick the closest category skill if evidence is strong.
4. For jails/sandboxes, map allowed syntax, blocked strings, builtins, imports, object graph access, and side channels.
5. For games/simulations, model state transitions and automate interaction.
6. For protocol tasks, capture grammar and implement a minimal client.
7. For encoding/puzzle tasks, build a reversible transformation chain and verify each step.
8. Keep solver reproducible in `solve.py` or `solve.js`.

## When to Pivot

- If the evidence is clearly crypto-shaped, hand off to `ctf-crypto`.
- If the evidence is clearly artifact extraction or evidence handling, hand off to `ctf-forensics`.
- If the evidence is clearly executable logic or binary validation, hand off to `ctf-rev`.
- If the evidence becomes classic web/service exploitation, hand off to `ctf-web` or `ctf-pwn`.
- If a specialist family is now obvious, transfer ownership early and preserve the eliminated routes.

## Tool Discipline

- Start with simple inspection: file type, strings, source, examples.
- Avoid random tool spraying.
- Use `ctf-terminal` for interactive protocols or jail sessions.
- Escalate to web/pwn/rev/crypto/forensics skills once the actual category is clear.

## Evidence Requirements

Misc conclusions require:

- Classification evidence.
- Reproducible transform, interaction, or extraction path.
- Verified final output.

## Output Contract

`notes.md` should include classification, tried paths, failed paths, and final method. Solver should automate the final method when practical.

## Stop Conditions

Ask or stop when classification remains ambiguous after basic triage, the puzzle requires external accounts or third-party services, or an attempted path needs unsafe/out-of-scope interaction.
