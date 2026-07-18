---
description: CTF readiness gate: verify whether the current CTF agent stack is fit for practical challenge testing
agent: daily
subtask: false
---

Run the CTF practical readiness gate for this configuration.

Scope:
$ARGUMENTS

Required workflow:
- Review `ctf-agent.manifest.json`, `opencode.jsonc`, the main CTF agents, key control commands, evidence helpers, benchmark expectations, and lesson index coverage.
- Prefer `node scripts/ctf-config-qa.ts readiness` as the first executable check.
- Include the per-family capability readiness view for `web`, `pwn`, `rev`, `crypto`, `forensics`, and `misc`, distinguishing READY / DEGRADED / BLOCKED and naming exact missing packs, tools, MCP defaults, or fallback gaps.
- Confirm the structured evidence packet contract: `inventory.md`, `route.json`, `hypotheses.json`, `signal-memory.yaml`, `primitive.json`, `closure.json`.
- Confirm the command helper contract and fanout/verifier contract are still present.
- Confirm lesson index coverage is usable, not merely present.
- Distinguish `PASS`, `PARTIAL`, and `BLOCKED`.

Return compactly:
1. Readiness verdict: READY / PARTIAL / BLOCKED.
2. Passed gates.
3. Missing or weak gates.
4. Highest-risk practical gap.
5. Exact next repair if not READY.
