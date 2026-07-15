# Efficiency V3.4 Patch Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

Goal: make the CTF primary agent faster by reducing model/tool routing loops while preserving safety for non-local or destructive actions.

## Changes

- Fixed `skills/ctf-web-recon/SKILL.md` YAML frontmatter by quoting the description field.
- Added `tools/ctf-one-shot-triage.ts`.
  - Emits machine-readable fields: `verdict`, `confidence`, `next_tool`, `next_target`, `spawn_subagent`, `direct_solve`.
  - Prioritizes direct flag hits, archive extraction, pcap/stego probes, RSA probe, source-map/static-web probes, Java/API mapping, and binary probe.
- Updated `ctf-agent` to call `ctf-one-shot-triage` before manual `ls/file/strings/grep` or subagent spawning.
- Changed `ctf-agent` model to `deepseek/deepseek-v4-pro` and lowered steps to 28 so it behaves as a fast router/direct solver, while specialized CTF subagents remain on the stronger configured model.
- Granted `ctf-agent` direct access to high-value Web/static tools:
  - `ctf-java-map`
  - `ctf-api-map`
  - `ctf-file-write-matrix`
  - `ctf-web-pattern-search`
- Allowed common read-only CTF binaries for the primary agent: `checksec`, `readelf`, `objdump`, `nm`, `ldd`, `exiftool`, `binwalk`, `zsteg`, `tshark`, `capinfos`, `javap`, and `jar tf`.
- Added workspace path guards to local file tools to prevent `../` or absolute path escape from the current workspace.
- Extended `ctf-web-probe` with optional `headersJson`, `cookie`, `method`, and `body` parameters for sessioned or header-gated CTF Web challenges.
- Added machine-readable routing fields to major probes where useful.
- Updated CTF command/prompt references to prefer one-shot triage first and fall back to quick triage only when needed.

## Validation

- `opencode.jsonc` parses as JSON.
- Skill frontmatter parses successfully.
- `npm run check` passes TypeScript validation.
