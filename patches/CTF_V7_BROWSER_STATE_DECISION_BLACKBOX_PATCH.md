# CTF v7 patch: browser runtime, executable decision state, large-file probes, black-box Web

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

## What changed

1. Browser/runtime permissions are consistent for Web solving.
   - `ctf-agent` and `ctf-web` now both allow `browser_*` and `puppeteer_*`.
   - Narrow Chrome runtime observation tools are allowed (`chrome_get_web_content`, `chrome_get_interactive_elements`, `chrome_chrome_get_web_content`, `chrome_chrome_get_interactive_elements`).
   - Broad `chrome_*` is set to `ask` instead of `deny`, so unknown Chrome MCP actions are not blocked by default but still require review.
   - Personal Chrome history/bookmark tools are denied in both primary and Web subagent modes.

2. Prompt-only decision constraints now have an executable controller.
   - Added `tools/ctf-decision-state.ts`.
   - Added permission `ctf-decision-state: allow` to every CTF agent.
   - Added prompt and skill requirements to use `init/rank/probe/observe/gate` for non-trivial medium/hard work.
   - The tool enforces top-3 active hypothesis discipline, probe-contract completeness, same-family no-differential attempt limits, and route/depth/pivot/final/stuck gate requirements.

3. Large-file probe memory usage is fixed.
   - `ctf-binary-probe` no longer reads the whole binary just to take a sample.
   - `ctf-pcap-probe` no longer reads the whole pcap just to take a sample.
   - Both now read bounded head samples via `fs.open().read()`.

4. RSA direct-flag semantics are stricter.
   - `ctf-rsa-probe` reports `direct_flag` only when decrypted output contains a flag-like hit.
   - Plaintext recovery without a flag regex is now `rsa_plaintext_candidate`, not a final flag.

5. Web black-box capability is improved.
   - Added `tools/ctf-web-blackbox-map.ts`.
   - Added `ctf-web-blackbox-map: allow` to `ctf-agent` and `ctf-web`.
   - Added black-box workflow guidance to `ctf-web` skill and `/ctf-web` command.
   - The new tool performs low-volume read-only discovery: key safe paths, forms, links, JS route hints, cookies, source-map hints, GraphQL/API/admin/upload/login/debug/admin-bot signals, browser-specific needs, and an attack-queue seed.

## Validation

- `npx tsc --noEmit` passes.
- `opencode.jsonc` parses as JSON.
