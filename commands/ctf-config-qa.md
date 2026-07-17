---
description: CTF config maintenance QA entry for agent/skill/tool/template changes
agent: daily
subtask: false
---

Run a focused QA pass for changes under `{env:OPENCODE_CONFIG_DIR}` that affect CTF agents, skills, tools, commands, templates, or benchmark behavior.

QA scope:
$ARGUMENTS

Required workflow:
- Build a concise QA plan first: changed files, expected impact, and the smallest checks that can falsify the change.
- Parse-check changed JSON/JSONC/frontmatter files when relevant.
- Prefer `node scripts/ctf-config-qa.ts <slug> [--web-target <path>] [--pwn-target <path>]` as the first runnable wrapper on this machine.
- Run existing smoke/benchmark/tooling checks before inventing new scripts:
  - `scripts/verify-ctf-tooling.ts`
  - `scripts/check-web-benchmarks.ts`
  - `scripts/check-pwn-benchmarks.ts`
- If the change is domain-specific, bias toward the matching benchmark family first, then run the broader tooling smoke.
- If the goal is practical readiness rather than a single patch, use the `readiness` slug and review `work/config-qa/<YYYYMMDD>-readiness/readiness.md` after the wrapper completes.
- Record outputs, regressions, and follow-up notes in `work/config-qa/<YYYYMMDD>-<slug>/`.
- If a check fails, summarize whether it is caused by the new change, a pre-existing issue, or missing environment prerequisites.

Execution notes:
- If `bun` is unavailable but local `node_modules/tsx` exists, the wrapper script should still run the TypeScript checks through `node node_modules/tsx/dist/cli.mjs`.
- If no family-specific benchmark target path is supplied, treat that family as `SKIP`, not `FAIL`.
- Preserve the distinction between `FAIL` and `SKIP` in the final report.

Return style:
- Report only changed surface, checks run, pass/fail, evidence path, and required follow-up.
