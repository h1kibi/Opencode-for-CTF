---
name: ctf-router
description: Use at the beginning of authorized CTF tasks to classify the challenge category, identify files/services, choose the smallest useful agent/toolset, and select the next specialized ctf-* skill.
compatibility: opencode
---

# CTF Router

## Purpose

Use this skill before solving a new CTF challenge. The goal is fast classification and the smallest effective workflow, not deep exploitation.

## Scope

Use only for authorized CTF, lab, benchmark, or local challenge targets.

## Fast Triage

Inspect only what is needed to classify:

- Challenge statement and flag format.
- File list and extensions.
- `README`, `challenge.json`, Dockerfile, and docker-compose files.
- Exposed URL, host, port, or netcat service.
- Binary type and architecture.
- Archive contents.
- Service interaction style.
- Obvious source framework, crypto primitive, pcap/memory/image/document artifact, or jail/game/protocol signs.

## Category Signals

### Web

Signals: URL, HTTP service, HTML/JS/CSS, Flask/Django/Express/PHP/Spring, routes, cookies, templates, SQL, upload forms, SSRF-like URL fetches.

Use: `ctf-common`, `ctf-terminal`, `ctf-web`.

### Pwn

Signals: ELF/PE binary, libc, Docker remote service, `nc host port`, `checksec`, buffer input, crashable service.

Use: `ctf-common`, `ctf-terminal`, `ctf-pwn`.

### Reverse Engineering

Signals: executable, APK, class/jar, crackme, license check, encoded flag, obfuscation, native library, anti-debug logic.

Use: `ctf-common`, `ctf-terminal`, `ctf-rev`.

### Crypto

Signals: encrypt/decrypt/sign/verify source, RSA/ECC/AES/hash/PRNG/oracle, math parameters, ciphertext, signatures.

Use: `ctf-common`, `ctf-crypto`.

### Forensics

Signals: pcap, memory image, disk image, document, archive, image/audio/video, metadata, hidden files, logs.

Use: `ctf-common`, `ctf-terminal`, `ctf-forensics`.

### Misc

Signals: jail, protocol, game, scripting puzzle, blockchain, ML, encoding stack, weird service, or mixed category.

Use: `ctf-common`, `ctf-terminal`, `ctf-misc`.

## Decision Rule

If uncertain, choose the category with the cheapest next verification step. Do not load heavy tools or high-risk MCP servers just to classify.

## Output Contract

Write this to `notes.md` before deep solving:

```markdown
# Triage
- Category:
- Confidence:
- Evidence:
- Selected agent:
- Selected skills:
- First three actions:
```

## Stop Conditions

Stop and ask when scope is unclear, the target appears non-CTF/non-authorized, or classification requires external scanning beyond the challenge environment.
