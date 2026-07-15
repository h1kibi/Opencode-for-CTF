# Efficiency v3.2 Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

Focus: CTF efficiency first, no step budget cuts.

## Applied changes

- Set CTF workspace guidance and permissions to `C:\Users\Administrator\Desktop\Agent\ctf-workspace`.
- Kept existing CTF step budgets unchanged.
- Added `ctf-safe-extract` for safe archive listing, Zip Slip/path traversal checks, extraction into `extracted/<archive-name>/`, flag scanning, suspicious file hints, and next-action suggestions.
- Added `ctf-safe-extract`, `ctf-quick-triage`, `ctf-file-triage`, and `ctf-flag-grep` to all CTF agents/subagents.
- Added `ctf-rsa-probe` to crypto and misc subagents.
- Updated `ctf-agent` prompt to prefer one-shot triage, safe archive extraction, RSA probing, URL probing, direct solve, and minimal notes.
- Updated non-Web `/ctf-*` commands so `notes.md` is only required for non-trivial or branching solves.
- Added Web return-early rule to stop phase workflow once a direct verified path exists.
- Extended `ctf-rsa-probe` with Hastad broadcast and Fermat close-prime attempts, plus candidate de-duplication.
- Added portable `./rules-cn.md` to `instructions` while retaining the absolute fallback path.

## Validation

- `opencode.jsonc` JSON parse OK.
- `npm run check` OK after `npm ci`.
- `ctf-safe-extract` smoke test OK with a zip containing a flag.
- `ctf-rsa-probe` smoke test OK for known factors and Hastad-style broadcast.
