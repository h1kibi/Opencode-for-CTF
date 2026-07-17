---
description: CTF entry: OMO-style CTF workspace hygiene check; protect originals, organize work files, and prevent state loss
agent: ctf-expert
subtask: false
---

Check CTF workspace hygiene.

Workspace/context:
$ARGUMENTS

Rules:
- Do not delete files in this command.
- Protect original challenge artifacts from overwrite.
- Prefer `work/` for generated scripts/data, `extracted/` for safe archive extraction, `notes.md` for compact state, `agent_flag.txt` for verified flag only.
- Check whether archives were extracted safely, large files were triaged before reading, and solve scripts are tracked.
- Detect multiple candidate flags, stale outputs, unrecorded payloads, or missing resume block.
- Detect missing structured evidence files under `work/ctf-evidence/<challenge-slug>/`, especially `inventory.md`, `route.json`, `hypotheses.json`, `signal-memory.yaml`, `primitive.json`, and `closure.json`.
- Recommend cleanup only as a plan; destructive cleanup requires explicit user confirmation.

Return compactly:
1. Workspace layout status.
2. Original artifacts at risk.
3. Missing standard files/directories.
4. State/resume gaps.
5. Candidate flags and verification status.
6. Safe organization plan, no deletion.
