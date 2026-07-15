# CTF Agent Efficiency v3 Patch Notes

This v3 patch incorporates the uploaded markdown recommendations with an efficiency-first bias. It is intended as a selectable config branch, not a destructive replacement for v2.

## Main changes

1. **Daily agent isolation**
   - Added `daily.permission.skill` with `ctf-*` denied.
   - Keeps daily development mode cleaner and reduces accidental CTF workflow/tool visibility.

2. **CTF subagent skill narrowing**
   - Replaced broad `"ctf-*": "allow"` in hidden subagents with category-specific skill allowlists.
   - `ctf-web` now sees `ctf-common`, `ctf-terminal`, `ctf-web`, and `ctf-web-*` only.
   - `ctf-pwn/rev/crypto/forensics/misc` now see only common/terminal plus their own category skill.

3. **MCP noise reduction**
   - CTF agents deny daily/research MCP surfaces such as Brave, Obsidian, Markitdown, Context7, GitHub, Jina, Firecrawl, and Tavily.
   - `ctf-web` keeps browser-like tools at `ask` while denying external search/research tools.

4. **Web fast lane conflict removed**
   - Rewrote `ctf-web.prompt` so simple Web challenges do not enter the full state machine by default.
   - Full `recon -> attack-queue -> focused-probe -> primitive-lock -> control-plane -> final-chain` is now reserved for multi-surface, stateful, bot, upload/file-write/race, or unclear targets.

5. **New `ctf-quick-triage` tool**
   - One-shot inventory for files/directories.
   - Reports flag-like hits, archive hints, RSA hints, category scores, suspicious highlights, and recommended next actions.
   - Designed to compress `ls -> file -> strings -> grep -> classify` into one tool call.

6. **Enhanced `ctf-rsa-probe`**
   - Still reports bit lengths and RSA weakness hints.
   - Now attempts direct solutions for known p/q, low-exponent exact roots, shared-prime GCD cases, and common-modulus pairs with suffixed variables such as `e1/c1`, `e2/c2`.
   - Prints flag-like hits from recovered plaintext.

7. **Enhanced `ctf-web-probe`**
   - Adds optional small same-origin JavaScript fetching.
   - Defaults: `fetchScripts=true`, `maxScripts=3`, `maxScriptBytes=200000`.
   - Greps scripts for API/admin/debug/flag routes, tokens/JWTs, source maps, debug flags, and flag-like strings.

8. **Pwn/rev confirmation reduction**
   - Added high-frequency permissions for `ldd`, `seccomp-tools`, `strace -f` ask, `ltrace` ask, `gdb -q -batch`, and `chmod +x`.

9. **Watcher ignore**
   - Added ignores for `work/`, `extracted/`, large forensic images/captures, archives, `node_modules/`, and `.git/`.

## Validation performed

- `opencode.jsonc` parses as JSON.
- TypeScript tool check passed with `npm run check` after installing dependencies locally during validation.
- `node_modules/` was removed from the final package.

## Suggested use

Use v3 when you prioritize CTF solving speed over maximum tool visibility. Keep v2 available if you want a more conservative, broader-tool version.
