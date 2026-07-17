# Roadmap

This is the development roadmap for Opencode-for-CTF. It reflects current priorities and planned improvements.

## Short-term (Q3 2026)

- [x] **Path security** — Ported shared `path-policy.ts` with `resolveAllowedPath()`, `isSensitivePath()`, `CTF_ALLOWED_ROOTS` support
- [x] **Python dependency declaration** — Added `requirements.txt` and `requirements-docs.txt` for CTF toolchain
- [x] **Published-files completeness** — Added `benchmarks/`, `retros/`, `patches/`, `third_party/` to package manifest
- [x] **Config sanitization** — Removed all hardcoded absolute paths from `opencode.jsonc`, `.env.example`, agent files
- [x] **Default entry convergence** — `/ctf` is the single default user path; L0/L1 command surface documented via `/ctf-help`
- [x] **Category router** — Pure `decideRoute()` in `ctf-core` + `ctf-route-plan` tool; hooks inject solve-mode hints
- [x] **Plugin user config** — `opencode-for-ctf.jsonc` with `disabled_hooks`, hashline/continuation/team toggles
- [x] **Naming debt** — `ctf-expert` / `/ctf-solve` marked compatibility-only; primary agents are `ctf-fast` + `ctf-expert`
- [x] **Adapter package** — `ctf-adapter-opencode` now re-exports router + OpenCode product constants (no empty stub)
- [x] **CI release gate** — Build plugin before `release:check`; package files include INSTALL/LICENSE/SECURITY
- [x] **Slim pack Phase A** — Drop intermediate pattern cards / skills-external from default npm+install; pack content probe in `release-check`
- [ ] **Slim pack Phase B** — Optional distilled v9 / full pattern cards on demand
- [ ] **CI/CD maturity** — Broaden matrix (OS), enforce coverage thresholds, Dependabot
- [ ] **Coverage improvement** — Raise test coverage thresholds, add tests for `tools/lib/` modules
- [ ] **Integration tests** — Mock OpenCode event flow to test plugin hooks end-to-end
- [ ] **Skill verification** — Verify all 61 skills match actual directory structure and are loadable
- [ ] **Command verification** — Auto-check all 129 commands have valid YAML frontmatter
- [ ] **Knowledge index automation** — Auto-build `lessons.index.json` from lesson files
- [ ] **Pattern card lifecycle** — Clean up v2–v9 iterations, single versioned source of truth
- [x] **npm metadata** — Added engines, keywords, homepage, bugs
- [x] **Team Mode production runtime** — Ported Desktop's dispatch/collect/cancel/close/recover with event-driven notification

## Medium-term (Q4 2026)

- [ ] **Multi-platform support** — Test and fix Linux/Mac compatibility for all scripts and tools
- [ ] **Benchmark runner** — Implement `ctf-benchmark-core` runner to auto-validate agent behavior
- [ ] **MCP config single-source** — Reduce triple-maintenance (registry, profile, opencode.jsonc)
- [ ] **Schemata** — JSON schema for CTF workspace config, decision state, evidence board, plugin user config
- [x] **CLI/npm install shape** — `opencode-for-ctf` bin help, force rebuild on install/upgrade, post-install `/ctf` guidance, `pack:check`
- [ ] **Publish to npm registry** — First public `opencode-for-ctf` release; document `npx opencode-for-ctf install` as primary path
- [x] **Tool packs at startup** — Register only configured packs (default excludes android/godot); `tool_packs` / `OPENCODE_CTF_TOOL_PACKS` / `ctf-tool-packs`
- [ ] **True mid-session pack hot-load** — Dynamically register packs after `ctf-route-plan` without restart (needs OpenCode tool registry mutability)
- [ ] **Telemetry / observability** — Structured logging, solve-rate tracking, failure-pattern collection
- [ ] **Retro automation** — Auto-generate retro lessons from solved/unsolved challenge states

## Long-term (2027+)

- [ ] **Cross-runtime support** — Adapt plugin for Codex CLI, Claude Code, Cline (extract adapter only when a second harness is real)
- [ ] **Knowledge graph** — Link lessons → pattern cards → tool usage for intelligent retrieval
- [ ] **Multi-challenge orchestration** — Team-mode across several challenges simultaneously
- [ ] **Automated challenge triage** — Given a challenge artifact, auto-detect category and suggest first steps
- [ ] **Community skill marketplace** — Allow community-contributed skills with versioning
- [ ] **CTF competition mode** — Time-boxed solving with real-time team coordination
- [ ] **LLM-native plugin config** — Plugin self-configures via conversational setup

## Completed ✓

- [x] Core plugin architecture (hooks, events, state management)
- [x] Primary agents `ctf-fast` / `ctf-expert` with compatibility `ctf-expert`
- [x] 148 tool definitions covering all CTF categories
- [x] Commands with L0 default surface (`/ctf`, `/ctf-help`, …)
- [x] 61 skills with solve state machines
- [x] Evidence board and decision state machine
- [x] Category routing library (`ctf-core` router)
- [x] Dynamic MCP lifecycle management
- [x] Team mode orchestration
- [x] Session continuation with auto-nudge
- [x] Cross-process file locking
- [x] Multi-arch Docker support (PWN/REV)
- [x] Pattern card knowledge base (9 versions)
- [x] Open source infrastructure: LICENSE, CI, contributing guide
- [x] Managed install, upgrade, status, doctor, uninstall
- [x] Optional `opencode-for-ctf.jsonc` hook configuration
