# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-07-19

### Added

- Release gate and preflight cleanup for the v0.1.1 GitHub release candidate.

### Changed

- Route/runtime contract tightened so primary agents remain `ctf-fast` / `ctf-expert` while family/category selection only affects capability overlays.
- `ctf-env-check` now emits structured environment probe results and feeds family readiness with real probe-backed data.
- Dynamic MCP lifecycle and release cleanup were hardened to reduce approval/state drift.
- Compatibility/documentation wording was narrowed around legacy aliases and `notes.md` vs canonical Evidence.md state.

## [0.1.0] — 2026-07-17

### Added

- Public-release docs: `INSTALL.md`, `RELEASE_CHECKLIST.md`, authorized-use banners in README, portable workspace template paths, and `SECURITY.md` aligned to SemVer `0.1.x`.
- GitHub issue / PR templates under `.github/`.
- CI builds the plugin bundle before `release:check` so clean clones pass without a pre-existing `dist/`.
- `package.json` / `release-check` now require `INSTALL.md`, `LICENSE`, `SECURITY.md`, `RELEASE_CHECKLIST.md`, and the workspace template among publish assets.
- Node engines relaxed to `>=22.20.0` (compatible with common Node 22 LTS installs).
- **Slim pack (Phase A):** default npm/install surface drops intermediate pattern cards (`cards.json` / `v2`–`v8`), pattern-card build scripts, `skills-external/`, `benchmarks/`, `retros/`, and `patches/`.
- `package.json` `files` uses an **explicit knowledge allowlist** (not bare `knowledge/`) so npm cannot re-include card history even when `.npmignore` is ignored for directory entries.
- Shared filters in `scripts/lib/publish-assets.mjs`; managed install skips the same knowledge history so source checkouts do not re-bloat `~/.config/opencode`.
- `release-check` pack probe asserts forbidden/required paths and reports size (`npm pack --dry-run --json --ignore-scripts`).
- `ctf-evidence-board` now maintains **Evidence.md** as the human source of truth with route states `untested | blocked | dead | live` (exactly 3 routes; blocked ≠ dead).
- `ctf-mcp-control` for ctf-expert approve/deny of pending heavy MCP requests.
- `ctf-fast` lightweight tool allowlist enforced in `tool.execute.before` (`FAST_TOOL_ALLOWLIST`).
- `ensureNamedServerLeases` so agent-default / agent-request MCP activation uses real registry configs (not empty skill bindings).
- `src/route-runtime.ts` — `/ctf` hard route handoff + `default_mode` resolution; `ctf-route-plan` and `command.execute.before` both honor `opencode-for-ctf.jsonc` `default_mode`.
- Session tool surface memory: when `/ctf` routes to expert while command agent is still `ctf-fast`, expert tools (Evidence.md, team, …) are allowed for that session.
- `ctf-handoff` tool — hard persona switch when `/ctf` BINDING primary is expert but command agent is still ctf-fast.
- Team jobs require `routeId` (`recon|R1|R2|R3|general`) + optional `concurrency`; new `ctf-team-cancel-route` keeps the live route only.
- Team notify + `ctf-mcp-control list-pending` push pending heavy MCP decisions before the next wave (not only on idle).
- Config `expert_tool_packs` merges into process registry with `tool_packs` (documented dual-layer: process superset + fast allowlist).

### Changed

- Removed primary agents `ctf-master` and `daily` from the product surface; CTF primaries are only `ctf-fast` / `ctf-expert`. `researcher` remains for knowledge-base maintenance. Commands that used `agent: ctf-master` now target `ctf-expert`.

- `skills/ctf-expert/SKILL.md`, `agents/ctf-expert.md`, `commands/ctf-expert.md`, and `ctf-expert` alias aligned to one contract: Team Mode + Evidence.md + 3 routes + 4 states + flag direct return + dynamic MCP approval.
- `approveRequest` lease key fixed to `agent-request:<agent>` (was incorrectly using sessionID).
- `/ctf` injects a **BINDING** route decision (not a soft hint); `/ctf-fast` and `/ctf-expert` get mode-specific contracts.
- Default product entry is now `/ctf` (auto-route + solve). `/help` documents the reduced public command surface.
- `/ctf-solve` remains a compatibility alias; primary agents remain `ctf-fast` and `ctf-expert` only.
- Filled `packages/ctf-adapter-opencode` with real OpenCode surface constants + router re-exports (was an empty stub).
- README / AGENTS / SECURITY / CONTRIBUTING cleanup: portable paths, fixed security advisory URL, Node engines aligned to `>=22.20.0`.
- Tool registration is pack-filtered at plugin startup: defaults omit rare `android` / `godot` packs.
- Install/upgrade rebuild the plugin bundle by default; CLI prints a real help page and post-install `/ctf` next steps.
- Managed install sets `default_agent` to `ctf-fast` when missing.

### Added

- Category router in `packages/ctf-core` (`decideRoute`, `scoreCategories`, `COMMAND_SURFACE`) and tool `ctf-route-plan`.
- Optional user config `opencode-for-ctf.jsonc` (`default_mode`, `disabled_hooks`, hashline/continuation/team toggles, `tool_packs`) via `src/plugin-config.ts`.
- Tool packs: `src/tool-packs.ts`, filtered `loadCtfTools({ packs })`, tool `ctf-tool-packs`, env `OPENCODE_CTF_TOOL_PACKS`.
- Explicit `/ctf-expert` command; install/example config `opencode-for-ctf.example.jsonc`.
- Plugin hooks honor `disabled_hooks` and inject solve-mode hints for `/ctf`, `/ctf-solve`, and `/ctf-expert`.
- `npm run pack:check` and `npm run ctf:help` for release/CLI smoke.

## [2026.07.0] — 2026-07-16

### Added

- Initial plugin architecture with 16 agents, 148 tools, 129 commands, and 61 skills.
- Two primary solving modes: `ctf-fast` (lightweight intuition-first) and `ctf-expert` (evidence-driven iterative).
- Evidence board system (`ctf-evidence-board.ts`) for cross-agent evidence tracking.
- Decision state machine (`ctf-decision-state.ts`) for route scoring and closure prioritization.
- Dynamic MCP lifecycle: per-agent default profiles + per-skill on-demand MCP leasing.
- Team mode orchestration: member management, task dispatch, inter-agent messaging.
- Session continuation management with automatic nudge on idle.
- Cross-process file lock for concurrent sub-agent state safety.
- CTF workspace template (`CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc`).
- Multi-arch PWN Docker images (aarch64, mipsel, x86_64, multiple glibc versions).
- Pattern card knowledge base (v1–v9) with structured retrieval.
- Structured lessons index with search support.
- 4 shared library modules: `exec-utils`, `go-elf-analysis`, `pwn-disasm-analysis`, `docker-config`.
- Full permission matrix per agent with granular bash/edit/task/skill rules.

### Fixed

- Import extension for workspace package cross-reference (`ctf-notes-core`).

### Infrastructure

- Added `LICENSE` (MIT).
- Added `CLAUDE.md` for AI-assisted development.
- Added `CHANGELOG.md`.
- Added `CONTRIBUTING.md`.
- Added `ROADMAP.md`.
- Added `SECURITY.md` with vulnerability reporting policy.
- Added CI pipeline (GitHub Actions): type check, test, coverage.
- Fixed `tsconfig.json` include paths (removed stale `.opencode/tools/`).
- Removed empty `ctf-adapter-opencode` workspace package.
- Removed stale `oh-my-openagent.json`.
- Added `opencode.json` to `.gitignore`.
- Added managed install, upgrade, status, doctor, and uninstall commands with JSONC-preserving config edits.
- Added manifest hashes, transactional rollback, file backups, and user-modification protection.
- Added a package CLI and release consistency checks for published installer assets.
