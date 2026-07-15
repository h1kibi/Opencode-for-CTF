# CTF Agent Efficiency v3.1 Notes

This patch keeps the v3 architecture and fixes the remaining efficiency blockers found during review.

## Changes from v3

1. Removed the remaining Web prompt conflict in `commands/ctf-web.md`.
   - Fast lane now stays authoritative.
   - The full recon -> attack-queue -> focused-probe -> primitive-lock -> control-plane -> final-chain flow is only for non-trivial targets.

2. Aligned `skills/ctf-web/SKILL.md` with the fast lane policy.
   - Direct verified source leaks / simple single-primitive paths can solve immediately.
   - `notes.md` and phase tracking are required for non-trivial Web targets, not trivial direct solves.

3. Made `/ctf` explicitly prefer `ctf-quick-triage`.
   - One tool call is preferred over separate `ls` / `file` / `strings` / `grep` passes.

4. Hardened `ctf-rsa-probe`.
   - Fixed shared-prime indexing for non-adjacent `n[i]` pairs.
   - Added direct decrypt for leaked `d`.
   - Added direct factor recovery attempts from `dp` / `dq` when `n/e/c` are available.
   - Added common-modulus attempts for both suffixed variables and unsuffixed indexed arrays.

5. Hardened `ctf-web-probe`.
   - Main page reads are capped at 1 MB.
   - JavaScript and robots/sitemap reads use capped streaming reads, so missing `content-length` no longer causes full huge-file reads.
   - Output now reports whether the main body was truncated.

## Validation

- `opencode.jsonc` parses as JSON.
- `npm run check` passes.
- `ctf-rsa-probe` and `ctf-quick-triage` were smoke-tested with local sample files.
