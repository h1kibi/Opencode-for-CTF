---
description: CTF control: OMO-style CTF state update gate; maintain a compact resume block and decision summary after phase changes
agent: ctf-master
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf-snapshot` or `/ctf-control` when you are unsure whether state maintenance is needed.
- Keep `/ctf-state-update` as a compact maintenance helper after confirmed phase changes.

Update CTF solve state after a meaningful phase change.

Context/update:
$ARGUMENTS

Rules:
- Use this after route, confirmed primitive, blocked branch, exploit construction, final candidate, or major pivot.
- Keep the update compact and reproducible.
- Prefer updating `notes.md` with a `CTF Resume Block`; use `.ctf-decision-state.json` when decision-state is active.
- Do not log secrets unrelated to the challenge. Do not dump large outputs.
- Mark each new observation as CONFIRMS, FALSIFIES, DIFFERENTIAL, BLOCKED, NOISE, or FINAL.
- Preferred entrypoint note: `/ctf-state-update` is a maintenance helper. When uncertain about whether you need a state refresh, use `/ctf-snapshot` or `/ctf-control` first.

CTF Resume Block format:
```markdown
## CTF Resume Block
Target:
Flag format:
Category:
Confirmed facts:
Blocked paths:
Top hypotheses:
Current primitive:
Last probe:
Next probe:
Candidate flag:
Files:
```

Return compactly:
1. State fields to update.
2. Observation classification.
3. Updated top hypothesis and next probe.
4. Whether `ctf-decision-state observe/gate` is required.
5. Minimal block content to write.
