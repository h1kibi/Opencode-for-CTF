---
name: ctf-writeup
description: Use after a CTF challenge is solved or a reproducible partial solve exists to produce a concise submission-style writeup with provenance, one complete solve path, evidence, and lessons learned.
compatibility: opencode
---

# CTF Writeup

Convert the evidence ledger into a reproducible handoff. This is a documentation skill, not a second solver or a place to invent missing steps.

## Load When

Load after a flag/closure or a stable partial solve has been verified, or when the team needs a structured handoff for an unresolved branch.

## Do Not Load When

Do not load during initial triage, before evidence is captured, or to fill gaps by guessing. Do not include real credentials, private infrastructure details, or unrelated exploit material.

## Required Inputs

Require challenge metadata, category, verified observations, commands/scripts, final oracle, dead ends worth preserving, and requested redaction level.

## First Safe Action

Collect artifacts and normalize the timeline; identify the shortest complete path from challenge input to final flag/closure and mark every unverified step.

## Dispatch / Handoff

Return `writeup.md` or a requested format to the active primary agent and `ctf-retro` for lessons. If the solve is not reproducible, label it partial and list the blocking evidence instead of fabricating a script.

## Output Contract

Produce:

```yaml
status: close | continue | blocked
category: web | pwn | reverse | crypto | forensics | misc
challenge: <name>
verified: true | false
artifacts: []
steps: []
flag_or_closure: <redacted or exact per request>
lessons: []
open_questions: []
```

The Markdown writeup should contain metadata, summary, 1–5 numbered steps, one complete solver or command path when practical, final verification, attribution, and a short lessons section.

## Stop Conditions

Stop when required metadata or evidence is missing, the user requests redaction that cannot be satisfied safely, or the writeup would expose secrets outside the challenge. Mark unresolved claims explicitly.

## Quality Rules

- Prefer one clean path over several speculative alternatives.
- Keep payloads tied to the supplied challenge and omit unrelated real-world targets.
- Include exact tool/version assumptions when behavior depends on them.
- Distinguish observed output, inferred mechanism, and hypothesis.
- Never replace a missing oracle with “works in theory.”
