# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Team supervisor (4.10): worker jobs carry `deadlineAt` / `lastHeartbeatAt` / `attempt` / `ownerToken`; `ctf-team-dispatch` accepts `timeoutMinutes` (default 30); `reconcile()` now enforces deadlines — a worker still `running` past its deadline is `interrupted` (attempt+1) and `failed` once the retry budget (`team_mode.max_job_attempts`, default 2) is exhausted — plus throttled heartbeats so status distinguishes alive from orphaned workers. `ctf-team-status` renders deadline/heartbeat/attempts; `evaluateJobDeadline()` is exported and unit-tested.
- `tools/crypto/ctf-prng-attack.ts`: PRNG attack runner — LCG (a, c, m) recovery from >= 4 consecutive outputs with m optionally recovered via multi-window difference-gcd; MT19937 state cloning from 624 outputs (untemper + prediction). Recoveries are verified against the full supplied sequence and optional `expectedNext`.
- `tools/crypto/ctf-ecdsa-attack.ts`: ECDSA nonce-reuse / known-nonce attack runner — recovers k and d with verification against the signature equations, and feeds flag-shaped messages through the flag oracle.
- `tools/misc/ctf-encoding-chain.ts`: auto-detecting encoding-chain unroller (base64 / base32 / hex / binary / url / rot13 / rot47) with per-layer round-trip verification, cycle guards, a rot13-lookalike-aware flag-stop, and flag-oracle integration.
- Router calibration + cheap probes (`packages/ctf-core/src/router.ts`): `probeFileTree()` / `probeFileMagic()` turn attachment names/magic bytes into routing signals; a single ambiguous keyword (java/heap/…) no longer forces expert with ~0.95 confidence — confidence is now mass+separation calibrated and capped at 0.9; `ctf-route-plan` accepts `fileNames` / `fileMagics` for attachment-only challenges.
- `tools/crypto/ctf-rsa-attack.ts`: executable RSA attack family (direct p/q, shared prime, common modulus, Fermat, small-e, Hastad broadcast, Wiener) with BigInt arithmetic, modulus-size guard, and dual verification verdicts (`mathematically verified` / `oracle-verified` / `candidate`) via `verifyCandidateFlag`.
- MCP lease lifecycle state machine: `pending | connecting | connected | disconnecting | unknown` statuses with per-attempt owner tokens (fencing), persisted claim transitions under the file lock, stale-connecting takeover after 15s, connect-failure rollback, and disconnect-failure compensation (revert to connected) in `src/skill-mcp-manager.ts`.
- `test/tool-drift.test.ts`: registry drift checks — `FAST_TOOL_ALLOWLIST`, subagent light lists, and `ctf-agent.manifest.json` tool references must all resolve to real files on disk; compat aliases must not point at ghosts.
- `src/flag-oracle.ts`: shared flag verification (exact / pattern / hash / file-check) with outcome statuses (`executed | crashed | timeout | primitive-confirmed | interactive-shell | candidate-flag | oracle-verified | reproduced`); reused by `ctf-pwn-runner` and aligned with `packages/ctf-benchmark-core`'s oracle.
- `loadCtfToolsWithReport()`: structured tool-load report (registered / deferred / failed / runtime dependencies / critical missing); `src/plugin.ts` persists it to `runtime/state/tool-load-report.json` and logs critical failures at startup.
- Structured permission classification (`classifyCtfPermission` / `classifyBashRisk`) with `read | execute | network | debug | destructive` risk levels.
- Evidence board `flag-verify` command (records oracle-verified flag, sets phase=success) and `oracleVerified` gate for `set-route-state live`.
- New env-gated heavy MCP slots: `jadx-mcp`, `gdb-mcp`, `x64dbg-mcp`, `mysql-mcp`, `ssh-mcp` (all opt-in, require explicit `*_MCP_COMMAND` env).
- `ctf-pwn-fast-skeleton-hints` promoted to the light pwn surface (ctf-fast allowlist, pwn subagent lightweight list).
- `curated-cards.json` (82 hand-curated cards, 57 unique) is now loaded by default card search — it was packaged but never wired into `defaultCardIndexPaths()`; it loads first so curated versions win id dedup.

### Fixed

- **Router over-confidence (P1)**: `HARD_SIGNALS` split into per-pattern counting — a bare `java`/`heap` mention no longer forces the expert lane; `confidenceFrom` now blends evidence mass and category separation with a 0.9 cap instead of the old near-0.95 score mapping.
- **MCP lease race (P1)**: `ensureNamedServerLeases` / `ensureSkillBindingLease` no longer decide "not connected → activate" outside the lock — claims are persisted as `connecting` under the lock, so two concurrent callers can no longer double-connect; `releaseSkillMcpLeases` marks `disconnecting` before the external call and reverts to `connected` on disconnect failure instead of leaving state claiming disconnected while the connection is live.
- **Benchmark silent success (P0)**: all six `scripts/check-*-benchmarks.ts` now FAIL (exit 1) when a benchmark directory has no solver output; `CTF_BENCH_ALLOW_EMPTY=1` produces an explicit SKIP (exit 0) for local dev only.
- **Flag heuristic success (P0)**: `ctf-pwn-runner` now distinguishes `candidate-flag` from `oracle-verified` (`flag_verification` / `verified_flag` / `success_class` / `outcome_status`); shell output alone no longer implies verified success.
- **Tool import failures visible (P0)**: import/contract failures are recorded with criticality + fallback instead of being swallowed by `console.warn`; missing critical tools (`ctf-agent.manifest.json` `required_tools`) are logged as `[CRITICAL]`.
- **Permission auto-allow narrowed (P0)**: `python`, `python3`, `node`, `tsx`, `npx`, `strace`, `ltrace` are no longer auto-approved by prefix; only read-only commands (`ls/cat/head/tail/file/which/strings/objdump/readelf/xxd/hexdump/od/nm/ldd`, safe `git` reads) remain auto-allow.
- **Evidence board transactional writes (P0)**: `persist()` runs under a per-board lock with atomic temp+rename for both board JSON and `Evidence.md`; `loadBoard` deep-validates via zod with legacy repair; invariants (routes ≤ 3, single live route) are enforced in the reducer and re-checked on persist.
- **Team reducer no longer silent (P1)**: `transitionTeamJobChecked()` returns `{ok, previous, current, reason}`; the legacy `transitionTeamJob` logs a warning on illegal transitions.
- **Symlink-safe workspace paths (P1)**: `resolveInsideWorkspace` now rejects symlink/junction escapes (realpath of base + per-component lstat) instead of a purely lexical containment check.
- sqlmap env probe hung 10-20s on "Press Enter to continue..." after `--version`; probes now pass `--non-interactive`.
- Card index loader tolerates UTF-8 BOM; stripped BOM from `curated-cards.json`.
- Stale `knowledge/` `source_file` prefixes after the rag migration rewritten to `rag/knowledge/` (52 entries across 4 card indexes).
- **Managed WireMCP never upgraded (P0)**: `upgradeManagedFiles` did not apply `managedBuiltSourceOverride`, so upgrades re-copied the unbundled source `mcp-server/vendor/WireMCP/index.js`; installed WireMCP failed with `Cannot find module '@modelcontextprotocol/sdk'`. Upgrades now deliver the self-contained `dist/wiremcp` bundle, matching fresh installs.
- **Broken default MCP backends (P1)**: `cyberchef-mcp` and `ctfd-mcp` do not exist on npm (registry 404), and `ida-pro-mcp --stdio` is not a valid flag in ida-pro-mcp v2.x. Defaults fixed: `ctfd-mcp` → `npx -y ctfd-mcp-server`; `cyberchef-mcp` → env-driven `{env:CYBERCHEF_MCP_COMMAND}` (no official package — disabled by default and documented); `ida-pro` → plain `ida-pro-mcp` (stdio is the default transport). Launchers, server registry, env-check hints, doctors, tests, and docs updated.

### Changed

- Canonical knowledge base moved from `knowledge/` + `lessons/` to `rag/knowledge` + `rag/lessons`; `src/asset-paths.ts` prefers `rag/` with legacy fallback (fallback cached at module load, removal scheduled for v0.2.0).
- WireMCP launcher now resolves to the vendored bundle (`mcp-server/vendor/WireMCP/index.js`) instead of requiring `WIREMCP_LAUNCHER`; `ctf-env-check` reports the vendored entrypoint.
- `ctf-env-check` runs CLI/image probes concurrently with stable result ordering, cutting full-scan latency substantially.
- `pack:check` uses `npm pack --dry-run --ignore-scripts` to avoid recursive prepack runs.
- Doctors unified: `doctor.ts` converted to plain `scripts/doctor.mjs` behind `opencode-for-ctf doctor --tooling`; shared tool-check definitions and WireMCP status extracted to `scripts/lib/` (previously duplicated in three places).
- Coverage: scope expanded to `tools/**`; thresholds are now per-glob ratchets (`src/**` strict, global floor honest) — the coverage CI job is green again.
- v9 card index minified (27.1MB → 18.1MB; pack unpacked 31.1MB → 22.1MB); generator now emits compact JSON.
- Pattern-card build intermediates (cards.json, v2–v8, curation-candidates, ~66MB) are no longer git-tracked; they are regenerable via `build-ljagiello-cards-*.cjs`.
- Benchmark QA wired as `npm run check:benchmarks`; orphan `check-*.ts` scripts carry manual-QA headers.

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
- Historical compatibility commands are no longer installed as slash-command entrypoints; primary agents remain `ctf-fast` and `ctf-expert` only.
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
- Plugin hooks honor `disabled_hooks` and inject solve-mode hints for `/ctf` and `/ctf-expert`.
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
