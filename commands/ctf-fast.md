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
- Runtime enforces a **fast tool allowlist** (triage, light web/pwn/crypto/forensics probes, python-inline). If a tool is blocked, report the blocker and stop rather than fighting the surface.
- The allowlist only describes what `ctf-fast` may use after plugin startup. Actual availability still depends on startup pack export and host/session refresh; after changing `tool_packs` or plugin files, restart OpenCode and verify with `ctf-tool-packs` if lightweight PWN tools seem missing.
- Before active solving, initialize a lightweight evidence case with `ctf-evidence-board command=init category=<direction> challengeName=<name-if-known> target=<target>`. It creates `work/ctf-evidence/<direction-name|direction-MMDDHHmmss>/` for notes/handoff. Use `web-hello` style when the title is known; otherwise `pwn-0719131706` style. Do not use Team Mode or heavy Evidence ceremony.
- After evidence case initialization, identify the current environment / shell / substrate. If this is Kali, remember its built-in tool environment is likely available. If this is Windows / PowerShell, default to `curl.exe`, prefer `python -c` or small script files / `ctf-python-inline`, and avoid bash/heredoc examples like `python - <<'PY'`. If this is Linux / WSL / Kali, bash/heredoc style is appropriate again.
- Treat the 15-minute budget as a soft self-review horizon only; `ctf-fast` can be used indefinitely. Near expiry, judge whether progress is still likely to reach a flag. If not, save state and stop with a compact report of the blocker, strongest evidence, and best next direction; the user decides whether to switch to `ctf-expert`. The lane never switches automatically.
- For URL-only Web, usually start with `ctf-web-analyze`; use `ctf-web-fingerprint` or `ctf-web-blackbox-map mode=light` only as focused fallback.
- If JS/runtime/admin-bot/DOM evidence appears, use exactly one concise next-step tool.
- If source/debug/config/archive clues appear, pivot to the cheapest source-guided read.
- If a direct exploit path is visible, exploit immediately.
- If two or three consecutive same-family attempts show no new differential, treat payload rewrites as the same family unless the primitive / sink / oracle / parser / state boundary / closure path changes. You must switch to one orthogonal family or closure path; if no credible fast pivot exists, stop and report the blocker with the best next direction.
- If the target reveals real complexity, stop and report the blocker with the best next direction.
- If six to eight meaningful actions fail, bias toward stopping rather than broadening.
- If the target is source-rich, multi-artifact, stateful, or hard to classify, stop and report the blocker with the best next direction.

Return style:
- Be action-oriented and concise.
- If you stop without a flag, summarize strongest evidence, ruled-out path, and the best next direction.
