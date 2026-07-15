# CTF Efficiency V3.3 Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

This patch keeps `daily` as the global default agent and optimizes only CTF execution paths.

## Main changes

- Added priority-based `ctf-quick-triage` ordering so root manifests, routes, configs, entrypoints, archives, media, pcaps, and binaries are inspected before low-value deep files.
- Added head/tail sampling to `ctf-quick-triage` and `ctf-flag-grep` so large files can still reveal flags without full reads.
- Added URL normalization to `ctf-web-probe`; `localhost:8080` and `127.0.0.1:3000` are now accepted and normalized to HTTP URLs.
- Added four fast-lane probes:
  - `ctf-web-source-map`: compact source route/input/sink/secret map for Web source challenges.
  - `ctf-binary-probe`: one-shot pwn/rev binary metadata, protections, symbols, and strings.
  - `ctf-pcap-probe`: pcap protocol, HTTP, DNS, TCP stream, string, and flag overview.
  - `ctf-stego-probe`: media/document stego metadata, signatures, trailing-data, embedded-object, and strings overview.
- Added CTF short-circuit rules to the primary `ctf-agent` prompt.
- Reduced CTF subagent step budgets for faster failure and less context drift:
  - `ctf-agent`: 35
  - `ctf-web`: 50
  - `ctf-pwn`: 70
  - `ctf-rev`: 70
  - `ctf-crypto`: 45
  - `ctf-forensics`: 45
  - `ctf-misc`: 45
  - `ctf-retro`: 30
- Added provider timeout/chunkTimeout defaults and `small_model` for cheaper small tasks.
- Tightened global tool output and compaction defaults.
- Added `CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc` for optional workspace-local CTF mode with `default_agent: ctf-agent`, `snapshot: false`, tighter output, and irrelevant MCP disabled.

## Intended solve loop

1. `ctf-quick-triage` once.
2. Follow the highest-confidence short-circuit:
   - flag hit -> verify and write `agent_flag.txt`
   - archive -> `ctf-safe-extract`
   - RSA -> `ctf-rsa-probe`
   - Web source -> `ctf-web-source-map`
   - binary -> `ctf-binary-probe`
   - pcap/media -> `ctf-pcap-probe` / `ctf-stego-probe`
3. Spawn one specialized subagent only if the probe result shows direct solving is slower.
4. Prefer compact `solve.py` / `solve.js` / `exploit.py` over repeated manual commands.
