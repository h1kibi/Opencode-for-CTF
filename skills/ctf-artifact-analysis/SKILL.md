---
name: ctf-artifact-analysis
description: Use for analyzing challenge artifacts (source, binary, ELF, APK, pcap, archive, firmware, Docker) to extract entrypoints, sinks, secrets, and structural hints for all CTF categories.
compatibility: opencode
---

# CTF Artifact Analysis

## Purpose

Use this skill to get a structured first look at **any** challenge artifact. It automatically classifies the file type, extracts sinks/entrypoints/secrets/flags from source code, identifies binary protections and interesting strings, and routes the artifact to the correct analysis path. All subagents can use it — not just web for source audit.

## How to Use

1. **Build IR**: `ctf-artifact-analyze build target=<path>` 
   - IR is stored under `work/analysis/<slug>/artifact.db.json`
2. **Query rules**: `ctf-artifact-analyze query slug=<slug> ruleset=<rule-id>`
3. **Read raw IR**: view `work/analysis/<slug>/artifact.db.json` for comprehensive data

## Detected Vulnerability Classes

| Ruleset | Danger | Languages |
|---------|--------|-----------|
| `command-injection` | Shell/exec with user input | python, js, java, go, php, ruby |
| `sqli` | Unsanitized SQL query | python, js, java, php, go |
| `ssti` | Template injection | python, js, java, php |
| `ssrf` | Server-side request forgery | python, js, java, go, php |
| `deser` | Unsafe deserialization | java, python, php, js |
| `path-traversal` | File read/write with user path | python, js, java, go, php |
| `weak-crypto` | MD5, SHA1, ECB, hardcoded keys | python, js, java, go |

---

## Subagent Usage Scenarios

### Web Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **Source code provided** | Full source directory | `ctf-artifact-analyze build target=./` → `query ruleset=sqli` etc. |
| **Docker-compose + source** | Dockerfile, compose, env config | Build on root dir → review exposed ports, env vars |
| **JS bundle / SPA** | `bundle.js`, `app.js`, source maps | Build → review API endpoints, tokens in source |
| **Java WAR / Spring Boot** | `ROOT.war`, `application.properties` | Build → review routes, auth config |
| **Python Flask/Django** | `app.py`, `views.py`, `settings.py` | Build → review routes, `SECRET_KEY`, `DEBUG` |
| **PHP webapp** | `index.php`, `config.php` | Build → review file inclusion, eval usage |
| **API documentation** | OpenAPI/Swagger YAML | Build → review endpoints, auth schemes |
| **.env / config files** | `.env`, `config.json` | Build → find API keys, database creds, secrets |
| **Admin bot source** | `bot.js`, `bot.py` | Build → review cookie handling, XSS triggers |

### Pwn Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **Challenge binary (ELF)** | `chall`, `pwn` | Build → review protections, strings, imports |
| **Bundled libc** | `libc.so.6` | Build → review version, interesting symbols |
| **Source code + binary** | Source directory + binary | Build on root → map source sinks to binary behavior |
| **Dockerfile + compose** | `Dockerfile`, `docker-compose.yml` | Build → review base image, seccomp, exposed ports |
| **Exploit template** | `exploit.py`, `solve.py` | Build → review existing exploit skeleton |
| **Multiple ELF files** | Challenge directory | Build → identify all binaries, their relationships |
| **Kernel module** | `.ko` file | Build → review module params, device interface |
| **seccomp filter** | seccomp rules in source/Docker | Build → identify allowed syscalls |
| **Remote endpoint only** | Service interaction script | Build → review protocol, expected inputs |

### Rev Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **Binary crackme** | ELF/PE binary | Build → review strings, imports, entrypoints |
| **APK/Android app** | `.apk` file | Build → review manifest, native libs, entrypoints |
| **Firmware blob** | `.bin`, firmware dump | Build → identify architecture, embedded strings |
| **Go binary** | Go-compiled ELF | Build → review `.gopclntab`, function names |
| **Rust binary** | Rust-compiled ELF | Build → review panic strings, symbols |
| **.NET / Unity** | `.exe`, `.dll` | Build → review managed metadata, IL |
| **WASM module** | `.wasm`, `.wat` | Build → review imports, exports |
| **Python bytecode** | `.pyc`, PyInstaller | Build → review bytecode, embedded strings |
| **License/Key validation** | Source or binary | Build → review validation logic, constants |
| **Unpacked / deobfuscated** | After unpacking | Build again → diff with original binary |
| **Shellcode** | Raw `.bin` | Build → review architecture, syscalls |

### Crypto Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **Encryption script** | Python/JS/Java source | Build → `query ruleset=weak-crypto` |
| **RSA parameters** | `.pem`, `.key`, `.pub` | Build → identify key size, format |
| **Protocol capture** | Network trace | Build → identify protocol, encrypted messages |
| **Oracle script** | Python/JS interaction | Build → review oracle behavior, side channels |
| **Custom cipher** | Source code | Build → review algorithm structure, constants |
| **Signature scheme** | Source code | Build → review signature logic, nonce handling |

### Forensics Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **PCAP / PCAPNG** | Network capture | Build → identify protocols, streams |
| **Disk image** | `.dd`, `.e01`, `.vmdk`, `.qcow2` | Build → identify partition scheme, file system |
| **Memory dump** | `.mem`, `.raw`, `.vmem` | Build → identify profile, OS |
| **Image with stego** | `.png`, `.jpg`, `.bmp` | Build → examine metadata, appended data |
| **Document** | `.pdf`, `.docx`, `.xlsx` | Build → examine metadata, embedded objects |
| **Archive** | `.zip`, `.7z`, `.rar`, `.tar` | Build → list contents, identify payloads |
| **Browser artifacts** | Browser cache, history | Build → identify URLs, timestamps |

### Misc Subagent

| Scenario | What to analyze | Command |
|----------|----------------|---------|
| **Unknown file** | Anything | Build → get automatic classification + hints |
| **Jail/Python jail** | Python script | Build → review restricted builtins, sandbox escape |
| **Game/Simulation** | Game binary/script | Build → identify game logic, state transitions |
| **Blockchain/Solidity** | `.sol` source | Build → review contract logic, vulnerabilities |
| **Encoding chain** | Encoded data + script | Build → identify encoding layers |
| **Mixed artifact** | Directory with multiple types | Build on root → get overview of all artifacts |

### Cross-Family / Team Scenarios

| Scenario | Subagents | Workflow |
|----------|-----------|----------|
| **APK with native JNI** | rev + pwn | rev: `build` on APK → identify native libs; pwn: `build` on `.so` → check protections |
| **Source + binary** | web + pwn | web: `build` on source → identify sinks; pwn: `build` on binary → verify exploit path |
| **Encrypted pcap + crypto script** | forensics + crypto | forensics: `build` on pcap → extract streams; crypto: `build` on script → find decryption |
| **WASM + web frontend** | rev + web | rev: `build` on WASM → identify logic; web: `build` on JS → find API interaction |
| **Multi-binary challenge** | pwn + rev | pwn: `build` on server binary; rev: `build` on client binary → compare protocol |
| **Firmware + web interface** | rev + web | rev: `build` on firmware; web: `build` on web interface → find auth bypass |

---

## Binary Analysis Details

For ELF/PE binaries, the tool extracts:

- **File info** via `file` command
- **Strings** — highlights strings containing: `flag`, `secret`, `key`, `password`, `http`
- **Architecture hints** — x86_64, aarch64, mips, riscv
- **Packer detection** — UPX markers, section anomalies (if host tools available)

For APK files:
- **Manifest** — activities, services, permissions
- **Native libs** — `.so` files per architecture
- **Entrypoints** — main activity, launcher

## Reference

Audit rules are stored in `knowledge/audit-rules/`. Load `REFERENCE_INDEX.md` for the full rule index.
