# CTF Evidence Layout

Use `work/ctf-evidence/<challenge-slug>/` as the canonical per-challenge state directory for non-trivial solves.

## Goals

- Make fast -> rigorous handoff predictable.
- Make interruption/resume independent of chat history.
- Make closure/final verification replayable from disk.
- Keep controller benchmarks focused on artifact contracts, not prompt wording.

## Canonical Files

Bootstrap helper:

- `node scripts/init-ctf-evidence.ts <challenge-slug>`
  - creates the canonical JSON and markdown restart files if missing
  - does not overwrite existing files
- `node scripts/write-route-state.ts <challenge-slug> '<json-patch>'`
- `node scripts/write-primitive-state.ts <challenge-slug> '<json-patch>'`
- `node scripts/write-closure-state.ts <challenge-slug> '<json-patch>'`
  - refresh canonical JSON state files with a shallow/field-wise merge
  - update `last_updated`
  - PowerShell-safe fallback syntax is supported: `key=value,key2=value2`
- `node scripts/write-evidence-state.ts <route|primitive|closure> <challenge-slug> '<json-patch|key=value,...>'`
  - unified writer for controller-friendly state refresh
  - preferred for future command integration
- `node scripts/read-evidence-state.ts <route|primitive|closure|preferred-restart> <challenge-slug>`
  - reads canonical JSON state or returns the preferred restart artifact path
  - intended as the matching reader for future command/runtime integration
- `node scripts/resume-helper.ts <challenge-slug>`
  - returns preferred restart artifact plus route/primitive/closure state
- `node scripts/snapshot-helper.ts <challenge-slug> [next-action]`
  - refreshes canonical route/primitive state and returns a compact control-action packet

### Core controller files

- `route.json`
  - current mode
  - primary owner
  - supporting surface
  - first safe tool
  - top route summary

- `primitive.json`
  - confirmed primitive
  - primitive family
  - strongest evidence
  - closure owner
  - blocker

- `closure.json`
  - best flag-location hypothesis
  - top closure probes
  - downgrade trigger
  - final validation plan

- `probes.jsonl`
  - one JSON line per meaningful probe
  - probe
  - oracle
  - result
  - state delta

### Human-readable restart files

- `resume.md`
  - mirror `templates/ctf_resume_packet.md`

- `handoff.md`
  - mirror `templates/ctf_handoff.md`
  - for general controller/specialist transfer

- `fast-handoff.md`
  - mirror `templates/ctf_fast_handoff.md`
  - for `ctf-fast` or `ctf-fast` escalation

- `snapshot.md`
  - mirror `templates/ctf_evidence_snapshot.md`
  - for compact best-evidence refresh

### Verification files

- `solve-output.txt`
  - sanitized solver or exploit transcript

- `final-verification.txt`
  - shortest reproduction path
  - primitive -> oracle -> closure step -> flag

## Family-specific optional files

- `pwn-state.md`
  - mirror `templates/pwn_state_compact.md`

- `owner-matrix.json`
  - mixed-surface challenges

- `flag-location.json`
  - closure-heavy challenges

- `whitebox-handoff.json`
  - source-rich or Java-heavy challenges

## Naming rules

- Keep filenames stable across categories.
- Prefer updating existing files over inventing new branch-specific names.
- If both markdown and JSON forms exist, JSON is controller-facing and markdown is human-facing.

## Preferred read order

When resuming or transferring control, prefer:

1. `resume.md`
2. `fast-handoff.md`
3. `handoff.md`
4. `snapshot.md`
5. `route.json`
6. `primitive.json`
7. `closure.json`
8. `notes.md`

## Minimum viable evidence pack

For a branch to be considered restart-safe, it should have at least:

- `route.json`
- one of `resume.md`, `fast-handoff.md`, or `handoff.md`
- `primitive.json` if any primitive is confirmed
- `final-verification.txt` once a real flag candidate exists
