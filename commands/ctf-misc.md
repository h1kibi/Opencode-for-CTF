---
description: Start a structured miscellaneous CTF solve
agent: ctf-misc
subtask: false
---

Use `ctf-common`, `ctf-terminal`, and `ctf-misc` skills.

Open `skills/ctf-misc/references/REFERENCE_INDEX.md` first when the challenge shape is unclear. Escalate to web, pwn, rev, crypto, or forensics skills once the real category is clear.

Challenge/target:
$ARGUMENTS

Rules:
- Work only on authorized CTF, lab, benchmark, or local targets.
- Create or update `notes.md`.
- Start with `ctf-misc-analyze`; classify the challenge before using heavy tools.
- If the prompt includes a challenge description or remote service, pass it as `description` or `service` to `ctf-misc-analyze` rather than relying on filename heuristics.
- For layered encodings, pass the candidate text content to `ctf-encoding-chain`, not only the path; verify each reversible layer.
- For image/video/audio targets, run `ctf-multimodal-triage` early; inspect bounded attachments, OCR, key frames, waveform, and spectrogram before broad extraction.
- For custom protocols/PPC, extract the endpoint, capture one bounded transcript, and build a minimal deterministic client before looping.
- For jails, map capabilities with benign probes before attempting an escape.
- Prefer a reversible transform, minimal client, or bounded classifier over broad guessing.
- Pivot early to `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, or `ctf-forensics` once the dominant evidence is specialist-family shaped.
- Build a reproducible transform, client, or solver when practical.
- Write only the verified final flag to `agent_flag.txt`.
