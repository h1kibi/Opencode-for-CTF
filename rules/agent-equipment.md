# CTF Agent Equipment Rules

This file declares the default tool, MCP, and environment equipment for every CTF agent lane.
Runtime facts are owned by code:

- Tool packs and allowlists: `src/tool-packs.ts`
- Family capability contracts: `src/family-capability-contracts.ts`
- Agent MCP defaults: `src/agent-mcp-profiles.ts`
- MCP registry and environment variables: `src/mcp-server-registry.ts`

If this rule conflicts with those files, update the code and this rule together.

## Global Loading Model

- The process tool registry is fixed at OpenCode startup.
- `tool_packs` and `expert_tool_packs` are unioned at startup; restart OpenCode after changes.
- Default registered packs are `core`, `web`, `pwn`, `rev`, `crypto`, `forensics`, `misc`, and `java`.
- Rare, heavy, or maintenance packs are opt-in: `maintenance`, `pwn-heavy`, `web-heavy`, `rev-heavy`, `java`, `forensics-heavy`, `android`, `android-dynamic`, `godot`.
- `ctf-fast` is narrowed by `FAST_TOOL_ALLOWLIST` even when more packs are registered.
- `ctf-expert` can use the full pack-filtered registry and owns Team Mode plus heavy MCP approval.
- Category subagents use their lightweight allowlist first; tools outside that list require expert approval through `ctf-dynamic-mcp-advisor` and `ctf-mcp-control`.

## Common Equipment

Common light MCP defaults for most CTF agents:

- `filesystem`
- `context7`
- `github`
- `markitdown`

Common lightweight tools for subagents:

- Routing/triage: `ctf-route-plan`, `ctf-file-triage`, `ctf-one-shot-triage`, `ctf-flag-grep`
- Facade routers: `ctf-web-analyze`, `ctf-pwn-analyze`, `ctf-rev-analyze`, `ctf-crypto-analyze`, `ctf-forensics-analyze`, `ctf-misc-analyze`, `ctf-encoding-chain`, `ctf-multimodal-triage`
- Focused fallback probes: `ctf-binary-probe`, `ctf-rsa-probe`, `ctf-pcap-probe`, `ctf-stego-probe`
- Artifact helpers: `archive-safe-extract`, `ctf-safe-extract`, `doc-read`, `image-file-info`, `ctf-artifact-analyze`
- State/knowledge: `ctf-evidence-board`, `ctf-decision-state`, `ctf-lesson-search`, `ctf-retro-search`, `ctf-pattern-card-search`, `ctf-pattern-to-hypothesis`, `ctf-imported-knowledge-search`
- Execution helpers: `ctf-python-inline`, `ctf-ensure-dir`, `ctf-env-check`
- Escalation/control: `ctf-handoff`, `ctf-tool-packs`, `ctf-dynamic-mcp-advisor`, `ctf-mcp-control`

## Primary Agents

### `ctf-fast`

Purpose: lightweight primary lane for simple to medium challenges.

Tool surface:

- Uses `FAST_TOOL_ALLOWLIST` only.
- Has light routing, triage, extraction, web, pwn, crypto, forensics, Python, environment, artifact, and handoff helpers.
- Not equipped with Team Mode by default.
- Must escalate instead of fighting blocked expert/heavy tools.

Key allowed tools include (prefer the facade tools first; direct probes are focused fallbacks after the route is known):

- Core: `ctf-route-plan`, `ctf-tool-packs`, `ctf-evidence-board`, `ctf-file-triage`, `ctf-one-shot-triage`, `ctf-flag-grep`, `archive-safe-extract`, `ctf-safe-extract`, `doc-read`, `image-file-info`
- Web light: `ctf-web-analyze`, `ctf-web-fingerprint`, `ctf-web-blackbox-map`, `ctf-web-probe`
- PWN light: `ctf-pwn-analyze`, `ctf-pwn-runner`, `ctf-pwn-check-env`, `ctf-pwn-offset`, `ctf-pwn-remote-fingerprint`, `ctf-pwn-probe`, `ctf-pwn-libc-hint`, `ctf-proto-probe`
- Rev/crypto/forensics light: `ctf-rev-analyze`, `ctf-crypto-analyze`, `ctf-forensics-analyze`, `ctf-misc-analyze`, `ctf-encoding-chain`, `ctf-multimodal-triage`
- Focused fallback probes: `ctf-binary-probe`, `ctf-rsa-probe`, `ctf-pcap-probe`, `ctf-stego-probe`, `ctf-image-open`
- Script/env: `ctf-python-inline`, `ctf-ensure-dir`, `ctf-env-check`, `ctf-artifact-analyze`
- Escalation: `ctf-dynamic-mcp-advisor`, `ctf-handoff`

MCP defaults:

- `filesystem`, `context7`, `github`, `markitdown`

Environment stance:

- Detect OS/shell/substrate early.
- On Windows/PowerShell, prefer PowerShell-safe syntax, `curl.exe`, and small script files.
- On Linux/WSL/Kali, bash/heredoc style is acceptable.
- For Linux ELF PWN, prefer a single Linux substrate once host execution is unsuitable.
- On Windows hosts with `C:\Tools`, route-specific local CLIs may be used without requiring global PATH updates. Active scanners such as `nuclei`, `ffuf`, `feroxbuster`, `dirsearch`, `sqlmap`, and broad `nmap` runs remain approval-gated.

### `ctf-expert`

Purpose: evidence-driven primary lane for complex, multi-route, or resumed challenges.

Tool surface:

- Uses the full pack-filtered process registry.
- Hard-required expert tools: `ctf-team-dispatch`, `ctf-team-status`, `ctf-team-collect`, `ctf-team-cancel`, `ctf-team-cancel-route`, `ctf-team-close`, `ctf-team-recover`, `ctf-team-adopt`, `ctf-evidence-board`, `ctf-mcp-control`, `ctf-decompose-task`.
- Owns Team Mode, Evidence.md, exactly-three-route planning, route-state transitions, and heavy MCP approval.

MCP defaults:

- `filesystem`, `context7`, `github`, `markitdown`, `browser`

Environment stance:

- Restart OpenCode after changing `tool_packs`, `expert_tool_packs`, or `team_mode`.
- Missing external binaries such as `ida`, `jadx`, `ghidra`, `apktool`, or `frida` are route-specific soft dependency failures, not global expert failure.
- Heavy MCP is approved only when tied to a current route and a concrete need.

## Category Subagents

### `ctf-web`

Expected packs: `core`, `web`

Light tools:

- `ctf-web-analyze`, `ctf-web-fingerprint`, `ctf-web-blackbox-map`, `ctf-web-probe`
- `ctf-api-map`, `ctf-proto-probe`

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `browser`, `jadx-mcp`, `mysql-mcp`, `ssh-mcp`

Soft dependencies and environment:

- Browser MCP is useful for runtime/admin-bot/SPAs, but curl/source-first fallback must remain viable.
- Request heavy JADX/DB/SSH/search MCPs only when source or route evidence justifies them.
- Approved local CTF CLIs from `C:\Tools`: `nuclei`, `ffuf`, `feroxbuster`, `dirsearch`, `sqlmap`, `nmap`, `whatweb`, `XSStrike`, `tplmap`, `Fenjing`, `phpggc`, and `ysoserial` when the route evidence justifies them. Use low-rate/manual probes first; use `nuclei` only after host, template scope, and stop condition are explicit.

### `ctf-pwn`

Expected packs: `core`, `pwn`

Light tools:

- `ctf-pwn-analyze`, `ctf-pwn-runner`, `ctf-pwn-check-env`, `ctf-pwn-offset`, `ctf-pwn-remote-fingerprint`
- `ctf-pwn-probe`, `ctf-pwn-libc-hint`
- `ctf-elf-slice`, `ctf-proto-probe`

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `gdb-mcp`, `ida-pro`, `ssh-mcp`

Soft dependencies and environment:

- Docker, gdb, pwntools, checksec, and pwnlab images improve parity but are not always hard blockers.
- Use Docker/pwnlab or WSL when Windows host execution is unsuitable.
- GDB, IDA, and SSH MCPs are requestable heavy MCPs through expert approval.
- Approved local static helpers from `C:\Tools`: radare2/r2 for quick disassembly, IDA Pro through the `ida-pro` MCP when configured, and SSH only for authorized challenge endpoints.

### `ctf-rev`

Expected packs: `core`, `rev`

Light tools:

- `ctf-rev-analyze`, `ctf-binary-probe`, `ctf-elf-slice`, `ctf-go-pclntool`
- `ctf-rev-pe-slice`
- Static slice and artifact-family helpers before dynamic/GUI tooling

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `ReVa`, `ida-pro`, `jadx-mcp`, `gdb-mcp`, `x64dbg-mcp`, `ssh-mcp`

Soft dependencies and environment:

- Ghidra/ReVa/IDA/JADX/GDB/x64dbg improve decompilation, xref, and debugger workflows.
- Android routes may require `android`, `android-dynamic`, or `java` packs plus Android SDK/ADB/jadx/frida/apktool. Use `ctf-android-analyze` as the first APK tool when the android pack is enabled.
- Docker revlab is recommended for cross-arch and heavier reversing environments.
- Approved local helpers from `C:\Tools`: IDA Professional 9.2, JADX, radare2/r2, dnSpy, and debugger MCPs (`ida-pro`, `gdb-mcp`, `x64dbg-mcp`) when the current route needs decompiler/debugger state.

### `ctf-crypto`

Expected packs: `core`, `crypto`

Light tools:

- `ctf-crypto-analyze`, `ctf-rsa-probe`
- `ctf-python-inline`
- `ctf-proto-probe`

MCP defaults:

- `filesystem`, `context7`, `github`, `markitdown`, `cyberchef-mcp`

Soft dependencies and environment:

- Sage is optional but useful for algebra/lattice routes.
- CyberChef MCP accelerates structured transform chains; Python fallback remains valid.
- Heavy search/knowledge MCPs require route-bound justification.
- Approved local helpers from `C:\Tools`: CyberChef and hashcat for transform/hash routes. Treat GPU cracking as optional and route-bound, not a default first pass.

### `ctf-forensics`

Expected packs: `core`, `forensics`

Light tools:

- `ctf-forensics-analyze`, `ctf-pcap-probe`, `ctf-stego-probe`
- `ctf-image-open`, `ctf-artifact-analyze`
- Heavy carving/extraction belongs to `forensics-heavy` or explicit expert approval.

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `wireshark-mcp`, `cyberchef-mcp`, `mysql-mcp`, `ssh-mcp`

Soft dependencies and environment:

- WireMCP/Wireshark helps packet workflows; raw pcap probe/carve fallback remains valid.
- CyberChef MCP helps decode/transform chains.
- MySQL/SSH MCPs are heavy requestable helpers for authorized lab/database artifacts only.
- Preserve originals and record hashes before extraction.
- Approved local helpers from `C:\Tools`: exiftool, Wireshark/WireMCP, CyberChef, and hashcat when artifact evidence points to metadata, packet, transform, or hash routes.
- Keep carving, cracking, and large extraction as route-bound follow-ups after lightweight triage.

### `ctf-misc`

Expected packs: `core`, `misc`

Light tools:

- `ctf-misc-analyze`
- `ctf-proto-probe`
- `ctf-python-inline`
- `ctf-ensure-dir`
- Common triage, state, and handoff tools

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `wireshark-mcp`, `cyberchef-mcp`, `mysql-mcp`, `ssh-mcp`

Soft dependencies and environment:

- Treat misc as classify-first.
- Use Wireshark/CyberChef only when packet/protocol/encoding evidence exists.
- Use MySQL/SSH MCPs only through expert approval and only for authorized challenge targets.
- Handoff quickly to web/pwn/rev/crypto/forensics when evidence becomes family-shaped.

### `ctf-aisec`

Expected packs: `core`, `web`, `misc`, `aisec`

Light tools:

- `ctf-misc-analyze`
- `ctf-aisec-env-check` (read-only Python/runtime/package capability matrix)
- `ctf-aisec-model-inspect` (static model/tokenizer/dataset fingerprinting)
- `ctf-aisec-inference-probe` (bounded local baseline with `{input_file}`)
- `ctf-proto-probe`, `ctf-web-source-map`, `ctf-python-inline`
- Common artifact, evidence, state, and handoff tools

MCP default candidates:

- `filesystem`, `context7`, `github`, `markitdown`, `browser`

Soft dependencies and environment:

- Treat AI security as a boundary-first specialist route, while the router family remains `misc`.
- Run environment check before model loading; missing optional ML packages degrade to static inspection/fallbacks.
- Reuse `ctf-misc-ai-ml` for technique references; keep the specialist skill focused on experiments, evidence, and handoff.
- Inspect prompts, agent/tool/RAG wrappers, model artifacts, tokenizer/data boundaries, and serialization before mutation.
- `ctf-aisec-model-inspect` never deserializes pickle/PyTorch artifacts; preserve originals and record hashes.
- `ctf-aisec-inference-probe` requires a workspace-local wrapper, bounded input/output, timeout, and no shell command string.
- `pip install`, model downloads, GPU/Docker, unsafe deserialization, remote model services, and broad probes require expert approval.
- Keep model extraction, poisoning, adversarial-input, and prompt-injection attempts bounded to authorized CTF/lab targets.
- Heavy Web/Rev/Forensics/Crypto tools remain requestable through expert approval; do not enable broad packs by default.
## Meta And Support Agents

- `ctf-scout`: common light MCP plus `browser`; gathers route evidence, not final ownership.
- `ctf-oracle`: common light MCP plus `seckb`; answers knowledge questions.
- `ctf-librarian`: `filesystem`, `seckb`; maintains reusable local knowledge.
- `ctf-verifier`: `filesystem`; verifies final evidence/flag claims with minimal surface.
- `ctf-retro`: common light MCP; post-solve lessons and feedback.
- `researcher`: support primary for manual post-solve reflection and local knowledge maintenance, not an active solve lane.

## Escalation Rules

- If `ctf-fast` needs Team Mode, heavy MCP, or tools outside its allowlist, escalate to `ctf-expert`.
- If a category subagent needs a tool outside its lightweight list, request it with `ctf-dynamic-mcp-advisor` and wait for expert approval.
- Do not install tools ad hoc during a worker route unless the expert approved the environment change.
- Do not treat missing soft dependencies as a reason to restart broad recon; use the declared fallback for that family first.




