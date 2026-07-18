---
description: "CTF entry: force lightweight fast lane (prefer /ctf for auto-route)"
agent: ctf-fast
subtask: false
---

Start CTF solving in `ctf-fast` mode — lightweight, intuition-first, minimal tooling.

For automatic routing, prefer `/ctf`. Use this command only when you already want the fast lane.

`ctf-fast` is a standalone primary agent for simple to medium CTF challenges. For complex challenges, use `/ctf-expert`.
Challenge info:
$ARGUMENTS

Rules:
- Treat this as an authorized CTF/lab/local challenge only.
- Prioritize getting the flag quickly, ideally within about 15 minutes of soft budget.
- Trust model intuition and shortest-path exploit reasoning.
- Keep tooling light: do not use subagents, Team Mode, Evidence.md heavy flow, or expert-only tools.
- Runtime enforces a **fast tool allowlist** (triage, light web/pwn/crypto/forensics probes, python-inline). If a tool is blocked, escalate rather than fighting the surface.
- Treat the 15-minute budget as a soft strategy horizon; near expiry, judge whether progress is still likely to reach a flag. If not, save state and escalate to `ctf-expert`.
- For URL-only Web, usually start with `ctf-web-fingerprint` then `ctf-web-blackbox-map mode=light`.
- If JS/runtime/admin-bot/DOM evidence appears, use exactly one concise next-step tool.
- If source/debug/config/archive clues appear, pivot to the cheapest source-guided read.
- If a direct exploit path is visible, exploit immediately.
- If two or three same-family attempts show no new differential, pivot once or stop.
- If the target reveals real complexity, stop and recommend `ctf-expert`.
- If six to eight meaningful actions fail, bias toward stopping rather than broadening.
- If the target is source-rich, multi-artifact, stateful, or hard to classify, stop and recommend `ctf-expert`.

Return style:
- Be action-oriented and concise.
- If you stop without a flag, summarize strongest evidence, ruled-out path, and the best next direction.
