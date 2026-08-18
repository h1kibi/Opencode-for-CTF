# opencode-for-ctf

**opencode-for-ctf** is an OpenCode plugin that turns a CTF workspace into a
multi-agent solving environment. It provides agents, slash commands, skills,
tools, local RAG, evidence tracking, optional MCP backends, and a team-mode
runtime for parallel worker orchestration.

The plugin is designed for authorized CTF competitions, labs, benchmarks, and
local challenge environments. Do not use it against systems you are not allowed
to test.

## Highlights

- `/ctf` auto-routes a challenge to the best solving lane
- Two primary agents: `ctf-fast` and `ctf-expert`
- Category subagents for Web, Pwn, Rev, Crypto, Forensics, Misc, and AI security
- 187 bundled tools organized into configurable tool packs
- 71 built-in skills plus local RAG knowledge and lessons
- Evidence-driven solving with `Evidence.md` and route state
- Team Mode for concurrent worker dispatch, collect, cancel, and recovery
- Managed install, upgrade, uninstall, doctor, and strict status checks
- Disabled-by-default MCP stubs for safe opt-in integration

## How It Works

When OpenCode loads the plugin, the runtime registers:

- primary agents and category subagents
- slash commands such as `/ctf`, `/ctf-fast`, `/ctf-expert`, and `/resume`
- CTF skills and skill references
- tool definitions and tool-pack visibility
- runtime hooks for continuation, evidence state, skill MCP, and team events
- local RAG paths for pattern cards, playbooks, lessons, and retros

The default flow is:

```text
/ctf ./challenge
  -> category routing
  -> ctf-fast or ctf-expert lane
  -> triage, analysis, evidence, probes, closure
```

`ctf-fast` and `ctf-expert` are primary agents. Category subagents are used by
`ctf-expert` for focused specialist work. `researcher` is a manual support agent
for post-solve reflection and knowledge maintenance.

## Agents

### ctf-fast

`ctf-fast` is the lightweight, intuition-first solving agent. It is intended for
simple-to-medium challenges where the fastest path is more important than full
orchestration.

Key behavior:

- Uses a small allowlisted tool surface
- Prefers direct triage, probes, scripts, and quick verification
- Avoids heavy reverse engineering, full scans, and long brute force
- Escalates to `ctf-expert` when the challenge becomes multi-step or requires
  team mode

Fast lane environment:

- Works on the current shell, whether Windows PowerShell, WSL, Kali, Linux, or
  Docker
- Prefers `curl.exe`, `python`, and lightweight CTF tools
- Uses Windows REV fast paths for packed or memory-rebuilt PE challenges
- Keeps flag reporting under a strict `flag_candidate -> oracle_verified`
  contract

Use `/ctf-fast` when the category is clear and the expected solve path is
short.

### ctf-expert

`ctf-expert` is the evidence-driven orchestration agent. It is designed for
complex, multi-step, or stuck challenges.

Key behavior:

- Maintains `Evidence.md` as the source of truth
- Keeps exactly three active routes with states: `untested`, `blocked`, `dead`,
  and `live`
- Dispatches concurrent subagents for independent work
- Runs evidence cross-check, lessons, retros, pattern-card recall, and
  full-text knowledge fallback
- Verifies flags only through an independent exact/file/service oracle
- Uses Team Mode for worker lifecycle when enabled

Expert workflow:

```text
recon
  -> evidence cross-check
  -> lessons / retros / knowledge recall
  -> exactly 3 routes
  -> verify
  -> success or failure
  -> retrospect on failure
```

Use `/ctf-expert` when:

- the challenge is complex or multi-stage
- multiple approaches need to be compared
- reverse engineering, binary exploitation, or long service chains are likely
- fast attempts have failed without a clear answer
- team mode or heavy MCP approval is needed

### researcher

`researcher` is not a CTF solving lane. It is a manual support agent for:

- sanitized post-solve reflection
- lessons and retros
- local `rag/knowledge` import and maintenance
- writeup or evidence review

Invoke `researcher` manually after a solve when you want durable learning
records.

### Category Subagents

| Agent              | Focus                                                          |
| ------------------ | -------------------------------------------------------------- |
| `ctf-web`          | HTTP services, source review, auth, SSRF, SQLi, XSS, deserialization |
| `ctf-pwn`          | Binary exploitation, heap/stack/kernel, docker/WSL/remote drift |
| `ctf-rev`          | ELF/PE, Android, VM/bytecode, packers, runtime and memory dump  |
| `ctf-crypto`       | RSA, ECC, PRNG, encodings, custom ciphers, oracle attacks       |
| `ctf-forensics`    | PCAP, disk/memory, stego, documents, malware triage, artifacts  |
| `ctf-misc`         | Jails, OSINT, encodings, games/VMs, protocols, multimodal media |
| `ctf-aisec`        | LLM agents, prompt injection, model artifacts, adversarial ML, RAG/tool boundaries |

### Meta Helpers

| Agent              | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `ctf-scout`        | Reconnaissance and hypothesis gathering                        |
| `ctf-librarian`    | Knowledge and pattern-card lookup                              |
| `ctf-oracle`       | Oracle calibration and verification planning                   |
| `ctf-verifier`     | Evidence and flag verification checks                          |

## Tools and Environment

### Tool Packs

Tools are grouped into packs so startup stays lightweight:

| Pack              | Includes                                                      |
| ----------------- | ------------------------------------------------------------- |
| `core`            | Common triage, evidence, extract, script, route, and RAG tools |
| `web`             | Web probing, source maps, blackbox maps, fingerprinting        |
| `pwn`             | PWN analysis, docker harness, probes, exploit helpers          |
| `rev`             | ELF/PE analysis, runtime dump, memory rebuild, reverse helpers |
| `crypto`          | RSA/ECC/PRNG attack families, crypto analysis                  |
| `forensics`       | PCAP carve/extract/probe, stego, media, image triage           |
| `misc`            | Encoding, DNS, QR, jails, multimodal triage                    |
| `aisec`           | AI/ML model inspection, inference probes, env checks           |
| `java`            | Java/Spring analysis and source mapping                        |
| `android`         | APK, DEX, JNI, dynamic Android analysis                        |
| `godot`           | Godot pack and resource inspection                            |
| `maintenance`     | Doctor, pack diagnostics, runtime self-test                    |

The default registry includes:

```text
core, web, pwn, rev, crypto, forensics, misc, aisec
```

Rare or heavy packs are omitted by default:

```text
maintenance, pwn-heavy, web-heavy, rev-heavy, java, forensics-heavy,
android, android-dynamic, godot
```

Use this in `opencode-for-ctf.jsonc` for a full expert environment:

```jsonc
{
  "tool_packs": ["all"]
}
```

Or list explicit packs:

```jsonc
{
  "tool_packs": ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "java"]
}
```

Restart OpenCode after changing tool packs.

### Runtime Prerequisites

| Requirement     | Notes                                                            |
| --------------- | ---------------------------------------------------------------- |
| Node.js         | `>= 22.20.0`                                                     |
| OpenCode        | Recent build with plugin, agents, commands, and skills support   |
| Git             | Required for source checkout                                     |
| Docker / WSL    | Optional but recommended for Pwn/Rev challenge runtimes          |
| Python 3        | Optional for Crypto, Misc, and Forensics helper scripts          |
| Ghidra / IDA    | Optional for deep reverse engineering                            |
| JADX / GDB      | Optional for Android and native debugging                        |
| x64dbg / WinDbg | Optional for Windows reverse engineering and interactive checkers |

### Environment Variables

| Variable                                 | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `OPENCODE_CONFIG_DIR`                    | Override the OpenCode config directory            |
| `OPENCODE_CTF_TOOL_PACKS`                | Override tool packs, e.g. `all` or `core,web,pwn` |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1` | Install external skill snapshots during setup     |
| `DEEPSEEK_API_KEY`                       | DeepSeek API key                                  |
| `GITHUB_PAT`                             | GitHub personal access token, read-only use       |
| `GHIDRA_INSTALL_DIR`                     | Ghidra install directory                          |
| `JINA_API_KEY`                           | Jina AI API key                                   |
| `BRAVE_API_KEY`                          | Brave Search API key                              |
| `CTF_ALLOWED_ROOTS`                      | Extra allowed filesystem roots                    |
| `CTF_ALLOWED_HOSTS`                      | Extra allowed private or lab hosts                |

See `.env.example` for the complete template. Do not commit real secrets.

## Team Mode

Team Mode is an expert-only concurrency runtime. It lets `ctf-expert` dispatch
multiple workers, collect structured evidence, cancel jobs, and recover runs
after restarts.

Core commands:

| Command                     | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `ctf-team-dispatch`         | Start a worker wave with route IDs             |
| `ctf-team-status`           | Inspect active runs and jobs                   |
| `ctf-team-collect`          | Collect worker results                         |
| `ctf-team-cancel`           | Cancel active workers or waves                 |
| `ctf-team-cancel-route`     | Cancel all workers for one route               |
| `ctf-team-close`            | Close a completed run                          |
| `ctf-team-recover`          | Recover runs after restart                     |
| `ctf-team-adopt`            | Adopt an orphaned run explicitly               |

Concurrency rules:

- Independent probes may run concurrently in one wave
- Jobs sharing mutable remote state or one interactive session must run serially
- `routeId` is required for dispatch
- `concurrency=independent` is the default
- `concurrency=shared_state` is only for jobs that must not overlap
- Expert keeps exactly three active routes during analysis and verification

Example plugin config:

```jsonc
{
  "team_mode": {
    "enabled": true,
    "max_workers": 8
  }
}
```

Workers return evidence packets only. They do not edit canonical `Evidence.md`,
write global flag files, or create parallel team state.

## RAG and Knowledge

The plugin uses local RAG to keep solving guidance searchable and compact:

| Path                      | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `rag/knowledge/pattern-cards` | Searchable technique cards                  |
| `rag/knowledge/pwn`       | Pwn playbooks and route gates                 |
| `rag/knowledge/rev`       | Rev playbooks and runtime workflows           |
| `rag/lessons`             | Human-maintained failure memory               |
| `rag/knowledge/retros`    | Retrospective indexes                         |

Runtime recall flow:

```text
ctf-lesson-search
  -> ctf-retro-search
  -> ctf-pattern-card-search
  -> ctf-pattern-to-hypothesis
```

Full-text fallback is available through `ctf-skill-repo-search` or imported
local knowledge search.

External SecKnowledge snapshots are optional:

```bash
npm run fetch-skills
```

To copy external reference skills during install:

```bash
OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1 npm run ctf:install
```

`skills-external/` is ignored and not included in the npm package.

## MCP Configuration

Managed installs register MCP stubs as disabled by default. Enable them only
after reviewing commands, paths, credentials, and data flow.

The repository provides:

- `mcp-server/ctf-tools-mcp-server.mjs`
- Portable WireMCP backend under `mcp-server/vendor/WireMCP`
- Launchers under `mcp-server/launchers`

Common external MCP integrations:

| MCP name        | Backend                                             |
| --------------- | --------------------------------------------------- |
| `browser`       | `@playwright/mcp`                                   |
| `wireshark-mcp` | Bundled WireMCP                                     |
| `ida-pro`       | `ida-pro-mcp` on PATH                               |
| `jadx-mcp`      | `{env:JADX_MCP_COMMAND}`                            |
| `gdb-mcp`       | `{env:GDB_MCP_COMMAND}`                             |
| `mysql-mcp`     | `{env:MYSQL_MCP_COMMAND}` plus `MYSQL_*`            |
| `x64dbg-mcp`    | `{env:X64DBG_MCP_COMMAND}` plus `X64DBG_PATH`       |
| `ssh-mcp`       | `{env:SSH_MCP_COMMAND}` plus `SSH_MCP_*`            |
| `cyberchef-mcp` | `{env:CYBERCHEF_MCP_COMMAND}`, disabled by default  |
| `ctfd-mcp`      | `npx -y ctfd-mcp-server`, disabled by default       |

Add custom MCP servers under `mcp` in `opencode.jsonc`, then restart OpenCode.

Example:

```jsonc
{
  "mcp": {
    "browser": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": false
    }
  }
}
```

## Installation

Managed install from source is the recommended path:

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
npm install
npm run check
npm run ctf:install
npm run ctf:status -- --strict
```

Restart OpenCode completely, then verify with:

```text
/help
/ctf ./challenge
```

The installer:

- Builds the plugin bundle into `dist/plugin`
- Deploys agents, commands, skills, rules, templates, RAG assets, and portable
  MCP backends into the OpenCode config directory
- Merges plugin, skill, instruction, and MCP entries into `opencode.jsonc`
- Writes disabled MCP stubs by default
- Records a manifest for later upgrade and uninstall operations

Default config directories:

| Platform      | Typical location                  |
| ------------- | --------------------------------- |
| Linux / macOS | `~/.config/opencode`              |
| Windows       | `%USERPROFILE%\.config\opencode`  |

Override with `OPENCODE_CONFIG_DIR`.

## Manual Reference

For a non-managed setup, build the plugin first:

```bash
npm install
npm run build:plugin
```

Then add this to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF/dist/plugin/index.js"],
  "default_agent": "ctf-fast",
  "skills": {
    "paths": ["/absolute/path/to/Opencode-for-CTF/skills"]
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/agent-equipment.md"
  ]
}
```

Managed install is preferred because it handles upgrades, uninstall, and
manifest-based protection of user-edited files.

## Commands

| Command        | Purpose                                   |
| -------------- | ----------------------------------------- |
| `/ctf`         | Auto-route and solve a challenge          |
| `/ctf-fast`    | Force the lightweight fast lane           |
| `/ctf-expert`  | Force the evidence-driven expert lane     |
| `/resume`      | Resume from an evidence branch            |
| `/help`        | Show the command surface                  |

## User Configuration

Copy `opencode-for-ctf.example.jsonc` to the project root or
`$OPENCODE_CONFIG_DIR/opencode-for-ctf.jsonc`, then edit it.

Common keys:

| Key                          | Meaning                                            |
| ---------------------------- | -------------------------------------------------- |
| `default_mode`               | `auto`, `fast`, or `expert` for `/ctf`             |
| `disabled_hooks`             | Disable individual runtime hooks                   |
| `hashline.enabled`           | Enable or disable hashed read/edit tags            |
| `continuation.enabled`       | Enable or disable continuation/compaction hooks    |
| `team_mode.enabled`          | Enable team-mode worker orchestration              |
| `team_mode.max_workers`      | Cap concurrent workers                             |
| `tool_packs`                 | Tool packs registered at startup                   |
| `expert_tool_packs`          | Extra packs merged for expert lanes                |
| `external_skills`            | Whether external skill paths are published         |

## Repository Layout

```text
opencode-for-ctf/
|-- src/          # Plugin runtime, hooks, team mode, MCP lifecycle
|-- agents/       # Primary agents and category subagents
|-- commands/     # Slash command definitions
|-- skills/       # CTF skills and references
|-- tools/        # CTF tools organized by category
|-- rag/          # Local RAG indexes, lessons, retros, knowledge
|-- mcp-server/   # Portable MCP server and launchers
|-- templates/    # Solve and environment templates
|-- rules/        # CTF solve and safety rules
|-- scripts/      # Install, doctor, build, release tooling
`-- packages/     # Shared core libraries and benchmarks
```

## Development

```bash
npm run check
npm run build:plugin
npm run release:check
npm run pack:check
```

### Benchmark checks

The benchmark corpus has two complementary layers:

- `npm run benchmark:scenarios` runs deterministic contract scenarios. Each scenario contains a pass artifact that must be accepted by its family checker and a fail artifact that must be rejected. This validates checker behavior and benchmark wiring; it is not an end-to-end agent solve-rate measurement.
- Scenarios may also contain `trace.json` in each pass/fail artifact directory. The manifest `traceContract` declares ordered required events and forbidden events, so the runner can validate behavior sequence separately from human-readable `notes.md` text.
- `npm run check:benchmarks` runs the family benchmark entry points. When a family has `scenario.json` manifests under the default `benchmarks/<family>` target, it automatically runs the scenario corpus for that family. Explicit target paths retain the legacy checker behavior for solver output directories and challenge fixtures.

The NYU benchmark runner is the place for real challenge execution with an independent private flag oracle, isolated agent workspaces, optional service lifecycle hooks, replay validation, and per-challenge/suite solve-rate reports. It is intentionally separate from the deterministic corpus: deterministic scenarios validate benchmark contracts, while NYU runs measure end-to-end solving.

To fetch a reproducible snapshot of the official NYU dataset, use the setup helper. It performs a blob-filtered, no-checkout clone and exports only the challenge directories referenced by the selected split. On Windows it extracts through a safe tar reader, rewrites invalid path segments, and does not expose `challenge.json` (which contains the private flag) in the agent workspace.

```bash
# Start with development; it is intended for strategy and integration work.
npm run benchmark:nyu:setup -- --dir .cache/nyu-ctf-bench --ref main --split development

npm run benchmark:nyu -- list \
  --dataset .cache/nyu-ctf-bench/development_dataset.json \
  --root .cache/nyu-ctf-bench \
  --split development

# Prepare one challenge's public files without running a solver.
npm run benchmark:nyu -- prepare \
  --dataset .cache/nyu-ctf-bench/development_dataset.json \
  --root .cache/nyu-ctf-bench \
  --split development \
  --id 2015q-rev-wyvern \
  --workspace .cache/nyu-workspaces/2015q-rev-wyvern
```

Run a single challenge or a suite with your solver command. The runner extracts candidate flags from solver output, verifies them against the private oracle, records stdout/stderr and lifecycle status, and returns a non-zero exit code when the selected run is not solved.

```bash
npm run benchmark:nyu -- run \
  --dataset .cache/nyu-ctf-bench/development_dataset.json \
  --root .cache/nyu-ctf-bench \
  --split development \
  --id 2015q-rev-wyvern \
  --workspace .cache/nyu-workspaces/2015q-rev-wyvern \
  --report .cache/nyu-reports/2015q-rev-wyvern \
  --solver-command opencode \
  --solver-opencode-command ctf-rev \
  --solver-model provider/model \
  --replay-command your-replay-command \
  --replay-required

npm run benchmark:nyu -- run-suite \
  --dataset .cache/nyu-ctf-bench/development_dataset.json \
  --root .cache/nyu-ctf-bench \
  --split development \
  --category rev \
  --workspace-root .cache/nyu-workspaces/rev \
  --report-root .cache/nyu-reports/rev \
  --solver-command opencode \
  --solver-opencode-command ctf-rev \
  --solver-model provider/model
```

Use `--split test` only for final evaluation, and keep test reports/private dataset storage outside any agent-visible directory. The complete `both` setup can be substantially larger than `development`; selecting a split makes the download and evaluation boundary explicit.

```bash
npm run benchmark:scenarios
npm run check:benchmarks
```

## License

MIT
