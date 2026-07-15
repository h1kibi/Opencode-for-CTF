# Opencode for CTF

[简体中文](./README.md)

An **OpenCode-based CTF automation agent configuration repository**.

This is not a single prompt or a loose collection of scripts. It is an engineering-oriented setup organized around **agents / commands / skills / tools / benchmarks** to make CTF workflows more structured, reusable, and extensible.

## Features

- **Multi-category support**: Web / Pwn / Rev / Crypto / Forensics / Misc
- **Automatic routing**: low-cost triage first, then handoff to the best category agent
- **Structured workflow**: emphasizes recon, hypothesis, verification, and closure
- **Tool-assisted solving**: includes file triage, flag grep, RSA analysis, Web probe, Java map, and more
- **Extensible design**: easy to add new skills, commands, tools, and benchmarks
- **Built for iteration**: suitable for long-term refinement with lessons, retros, and regression materials

## Who this is for

This repository is useful if you want to:

- use OpenCode for CTF automation
- turn prompts into a maintainable agent configuration project
- manage multiple CTF categories under one workflow
- extend MCP integrations, knowledge bases, or category-specific skills

## Repository structure

```text
Opencode-for-CTF/
├─ opencode.jsonc                # Main public template config
├─ AGENTS.md                     # Global operating rules and safety boundary
├─ .env.example                  # Example environment variables to customize locally
├─ requirements.txt              # Python dependencies
├─ package.json                  # Node/TypeScript dependencies and scripts
│
├─ .opencode/
│  ├─ commands/                  # Slash commands
│  └─ tools/                     # Custom tools
│
├─ skills/                       # CTF skill library
├─ templates/                    # solve / exploit templates
├─ benchmarks/                   # Benchmarks and regression materials
├─ lessons/                      # Lessons learned
├─ retros/                       # Retrospectives
├─ patches/                      # Configuration evolution notes
└─ scripts/                      # Verification scripts
```

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
```

### 2. Install dependencies

```bash
npm install
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Copy files into your OpenCode config directory

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode"
Copy-Item .\opencode.jsonc "$env:USERPROFILE\.config\opencode\opencode.jsonc" -Force
Copy-Item .\AGENTS.md "$env:USERPROFILE\.config\opencode\AGENTS.md" -Force
Copy-Item .\.opencode "$env:USERPROFILE\.config\opencode\.opencode" -Recurse -Force
Copy-Item .\skills "$env:USERPROFILE\.config\opencode\skills" -Recurse -Force
Copy-Item .\templates "$env:USERPROFILE\.config\opencode\templates" -Recurse -Force
```

### 4. Configure your own environment

This repository **does not include the author's personal provider / model configuration**. You must configure your own:

- provider / model setup
- API keys / tokens
- `CTF_WORKSPACE`
- local tool paths
- optional MCP services

See:

- `.env.example`
- `opencode.jsonc`

## Usage

Recommended entry points:

```text
/ctf ./challenge
/ctf-web http://127.0.0.1:8000
/ctf-pwn ./chall --remote 127.0.0.1:31337
/ctf-rev ./crackme
/ctf-crypto ./challenge.py
/ctf-forensics ./artifact.pcap
```

Recommended workflow:

1. Start with `/ctf` for unknown challenges
2. Use a category-specific command when the challenge type is clear
3. Keep `notes.md`
4. Produce reproducible scripts such as `solve.py`, `exploit.py`, or `solve.js`
5. Write `agent_flag.txt` only after confirmation

## Main components

### Agents

Category- and phase-specific agents, such as:

- `ctf-router`
- `ctf-web`
- `ctf-pwn`
- `ctf-rev`
- `ctf-crypto`
- `ctf-forensics`
- `ctf-misc`

### Commands

Unified entry points to reduce prompt setup overhead:

- `/ctf`
- `/ctf-web`
- `/ctf-pwn`
- `/ctf-rev`
- `/ctf-crypto`
- `/ctf-forensics`
- `/ctf-misc`

### Skills

Reusable methodology and focused capabilities, such as:

- Web recon / attack queue / JWT / IDOR / SSTI / SSRF / Upload / XSS
- Pwn workflows and references
- Crypto RSA references
- Java Web analysis

### Tools

Built-in high-frequency helper tools, such as:

- `ctf-file-triage`
- `ctf-flag-grep`
- `ctf-rsa-probe`
- `ctf-web-probe`
- `ctf-java-map`
- `ctf-api-map`
- `ctf-file-write-matrix`
- `ctf-web-pattern-search`

## What users must configure themselves

This public repository provides the framework and templates, not a personal environment snapshot.

### Model and provider

You should configure your own:

- available provider(s)
- model names and routing strategy
- large-model / small-model split
- API key injection method

### Workspace

- `CTF_WORKSPACE`
- external directory permissions
- filesystem MCP root

### Local tool paths

- `PUPPETEER_EXECUTABLE_PATH`
- `GHIDRA_INSTALL_DIR`
- `IDA_PATH`
- `SECURITY_MCP_WRAPPERS`
- `VMPROTECT_MCP`
- any other local tool paths you rely on

### Optional enhancements

- AnySearch
- browser automation MCPs
- document conversion MCPs
- local knowledge bases / self-hosted MCP services
- Reverse / Forensics toolchains

## Common verification commands

```bash
npm run check
npm run list
npm run tools:verify
```

## Recommended external tools

Not all of these are required, but they significantly improve usability:

- Node.js
- Python 3.11+
- Git
- OpenCode
- Chrome / Chromium
- Docker / Docker Compose
- gdb / checksec / ROPgadget
- Ghidra / JADX / Radare2 / Frida
- SageMath
- binwalk / exiftool / tshark / yara / volatility

## Safety boundary

This repository is intended only for:

- authorized CTF competitions
- local labs
- benchmarks
- explicitly authorized training environments

Do not use it against unauthorized targets.

Also, this configuration is not a sandbox. Run unknown binaries, malicious documents, or suspicious samples in isolated environments.

## License

This project is released under the [MIT License](./LICENSE).

## Suggested reading order

1. `README.md`
2. `AGENTS.md`
3. `opencode.jsonc`
4. `.opencode/commands/`
5. `skills/`
6. `.opencode/tools/`
7. `benchmarks/`
