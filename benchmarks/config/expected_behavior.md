# Config Optimization Regression Expectations

## Scope

These expectations guard the OpenCode CTF configuration optimization that split doctrine across docs, skills, tools, and the rigorous agent.

## Expected Behavior

1. `agents/ctf-rigorous.md` remains an orchestration prompt, not a large doctrine dump.
   - It references `docs/ABSTRACTION_BOUNDARIES.md` and `docs/CTF_STATE_SCHEMA.md`.
   - It loads `ctf-oob-discipline`, `ctf-web-java`, `ctf-whitebox-audit`, and `ctf-ledger-discipline` by evidence trigger.

2. Specialist skills hold detailed doctrine.
   - OOB/blind callback rules live in `skills/ctf-oob-discipline/SKILL.md`.
   - Java Web macro/source-closure rules live in `skills/ctf-web-java/SKILL.md`.
   - Source-first audit rules live in `skills/ctf-whitebox-audit/SKILL.md`.
   - Ledger/resume/branch-control rules remain in `skills/ctf-ledger-discipline/SKILL.md`.

3. Macro tools exist for first-pass routing.
   - `tools/ctf-web-recon-pack.ts`
   - `tools/ctf-java-analyze-pack.ts`
   - `tools/ctf-source-first-pack.ts`

4. `tools/ctf-decision-state.ts` supports both legacy operations and action-style operations:
   - legacy: `init`, `rank`, `probe`, `observe`, `gate`, `report`
   - action-style: `init_challenge`, `set_route`, `add_asset`, `add_signal`, `add_hypothesis`, `add_observation`, `mark_confirmed`, `mark_falsified`, `mark_blocked`, `add_primitive`, `closure_promote`, `add_closure_probe`, `next_action`, `snapshot`, `resume_summary`, `final_candidate`

5. `opencode.jsonc` keeps secrets as environment variables and documents strategy without broad provider rewrites.

6. Structured evidence packet discipline is active.
   - `templates/` includes `inventory.md`, `hypotheses.json`, and `signal-memory.yaml`.
   - `scripts/init-ctf-evidence.ts` bootstraps the expanded packet.
   - `scripts/ctf-config-qa.ts` verifies the packet helpers and contract checks.

## Regression Checks

- TypeScript tools compile under `tsconfig.json`.
- JSONC config can be parsed after stripping comments.
- No edited file is deleted; backups exist under `backups/config-opt-*`.
- New macro tools are explicitly allowed in `ctf-rigorous.md` permissions.
