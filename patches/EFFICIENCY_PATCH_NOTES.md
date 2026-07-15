# Efficiency Patch Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

This patch builds on the model-routing patch.

## Model routing preserved

- `daily`: `deepseek/deepseek-v4-pro`
- `ctf-agent` and all `ctf-*` agents: `aipie/gpt-5.4`

## CTF speed changes

- Expanded safe local triage bash allowlists for `ctf-agent` and specialized `ctf-*` subagents.
- Allowed `ctf-agent` to write solver/output files: `solve.py`, `solve.js`, `solve.sage`, `exploit.py`, `agent_flag.txt`, `failure_report.md`, `work/**`, and `extracted/**`.
- Changed `ctf-web-probe` to `allow` for `ctf-agent`.
- Added `ctf-retro` to `ctf-agent` task permissions.
- Rewrote `ctf-agent` prompt to solve trivial tasks directly and spawn one specialized subagent only when clearly faster.
- Reduced tool output limits from 800 lines / 30000 bytes to 350 lines / 15000 bytes.
- Made `ctf-common` and `ctf-router` skip heavy task-tree/table workflow for trivial direct solves.

## Config fixes

- Fixed `/kb-*` commands that pointed to disabled `build` agent:
  - `/kb-brave-test` -> `daily`
  - `/kb-index` -> `daily`
  - `/kb-collect` -> `researcher`
  - `/kb-github` -> `researcher`
- Fixed `MERGE_NOTES.md` contradiction: `ctf-agent` is a primary switchable agent, not a subagent.

## Safety kept

- Destructive deletion commands remain denied.
- SSH/SCP remain denied for CTF agents.
- Broad external scanning and unrelated recon tools remain denied or ask-gated.
