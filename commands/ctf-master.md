---
description: CTF entry: Start structured CTF solving in ctf-expert mode (replaces ctf-master)
agent: ctf-expert
subtask: false
---

Initialize CTF solving in `ctf-expert` mode.

ctf-master has been split into two primary agents: `ctf-fast` (lightweight, intuition-first) and `ctf-expert` (comprehensive, evidence-driven). This command now redirects to `ctf-expert`.

`ctf-expert` is the primary CTF control mode for complex, branchy, or multi-stage challenges. It follows an evidence-driven workflow: Recon → Analysis & Route Planning (3 routes) → Route Verification → Success/Failure → Evidence Collection → Iterate.

Challenge info:
$ARGUMENTS

Defaults:
- Use this command as an entry macro, not a second controller prompt.
- Default solve shape is: recon → 3-route plan → sequential validation → reflection if needed → stop on flag.
- Maintain `Evidence.md` as the single source of truth for known facts, clues, verified facts, and route states.
- Route states: 🟡 possible but unverified → 🔵 verified but blocked → ⚫ confirmed dead end → 🟢 correct path.
- If all 3 routes fail, collect evidence, re-analyze, and plan 3 new routes. Iterate until flag is found.
- Do not mistake WAF/obstacles for dead ends. Blocked routes may still be correct.
- For simple/quick challenges, use `ctf-fast` instead.
- Prefer source-first / white-box routes when source, archives, bytecode, Docker, or config are available.
