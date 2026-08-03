---
name: ctf-misc-osint
description: Use for OSINT-shaped CTF challenges involving public-source identity resolution, username/domain enumeration, DNS and certificate clues, web archives, geolocation, reverse image search, public filings, or timeline reconstruction.
compatibility: opencode
---

# CTF OSINT

Solve public-source puzzles with a hypothesis ledger and source provenance. Use only challenge-authorized public data and avoid interacting with private accounts or real people beyond the supplied puzzle scope.

## Load When

Load when the challenge's decisive evidence is public Web/search/archive/social/geolocation/metadata data rather than an application exploit or local artifact parser.

## Do Not Load When

Do not load for credential discovery, intrusive scanning, private-account access, doxxing, or a Web service whose vulnerability is the actual solve path. Hand those to the appropriate category.

## Required Inputs

Require the clue set, target scope, known identifiers, date/location constraints, permitted public sources, and a falsifiable candidate hypothesis.

## First Safe Action

Normalize clues and build a candidate table. Verify one low-cost public source or metadata clue before broad search; record URL/source, retrieval date, exact observation, and confidence.

## Dispatch / Handoff

Return identity/location/timeline evidence to `ctf-misc` and the final solve chain. If evidence becomes DNS/service exploitation, Web, or file forensics, pivot with the source packet.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-misc | ctf-web | ctf-forensics
facts: []
uncertainties: []
candidates: []
sources: []
strongest_signal: <one sentence>
next_action: <one public-source verification>
stop_reason: <required for blocked/dead/close>
```

## Stop Conditions

Stop when one candidate satisfies independent clues, sources become unavailable, the search would require private access or unsafe interaction, or the budget is exhausted. Do not treat a single search hit as confirmation.

## Workflow

1. Parse identifiers, timestamps, coordinates, image/file metadata, and naming patterns.
2. Search exact anchors first, then one controlled transformation at a time.
3. Cross-check with an independent source or orthogonal clue.
4. Preserve source provenance and explain eliminated candidates.
