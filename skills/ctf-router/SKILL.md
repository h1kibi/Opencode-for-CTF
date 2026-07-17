---
name: ctf-router
description: Use at the beginning of authorized CTF tasks to classify the challenge category, identify files/services, choose the smallest useful agent/toolset, and select the next specialized ctf-* skill. Prefer tool ctf-route-plan for a machine-readable decision.
compatibility: opencode
---

# CTF Router

## Purpose

Use this skill before solving a new CTF challenge. The goal is fast classification and the smallest effective workflow, not deep exploitation.

**Runtime helper:** call tool `ctf-route-plan` with the challenge text/path/URL first. It returns `mode`, `agent`, `skills`, `tool_packs`, and `confidence`. Treat that object as the default plan; this skill supplies methodology when signals are ambiguous.

**Product path:** prefer `/ctf` for users. `/ctf-master` is a compatibility alias of `ctf-expert` only — never present it as a third mode.

| Lane | When |
| --- | --- |
| `fast` / `/ctf-fast` | Strong single-category signals, simple one-hop |
| `expert` / `/ctf-expert` | Source-rich, multi-artifact, ambiguous, or hard |
| `resume` / `/ctf-resume` | Existing `work/ctf-evidence/<slug>/` branch |

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

## Evidence-Weighted Category Signals

Score every plausible category instead of forcing a single early label. Mixed challenges are common, so preserve secondary hypotheses until a cheap verification eliminates them.

### Web

Signals: URL, HTTP service, HTML/JS/CSS, Flask/Django/Express/PHP/Spring, routes, cookies, templates, SQL, upload forms, SSRF-like URL fetches.

Use: `ctf-common`, `ctf-terminal`, `ctf-web`.

### Web Exploit-Chain Signals

If any of these combinations appear, route to `ctf-web` and instruct it to use Primitive Lock mode immediately:

- stored XSS + admin bot
- admin bot + session/cookie leak
- debug page + source path leak
- upload/editor endpoint + server-side file path
- arbitrary/overwrite file write + framework reload/import behavior
- SSRF + internal admin/debug endpoint
- admin session + backend editor/upload/API
- source code + dangerous sink with reachable route

For these combinations, the first objective is not more enumeration. The first objective is to identify:

1. strongest confirmed primitive
2. stable control plane
3. lowest-risk final chain
4. reversible canary test
5. deterministic solver path

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

Prefer the category with the strongest evidence and cheapest next verification step. Do not load heavy tools or high-risk MCP servers just to classify.

For Web challenges, classify the exploitation phase:

- recon phase: target exists but route/input/auth/source map is incomplete
- attack-queue phase: attack surface is mapped and candidates need ranking
- focused-probe phase: one candidate is selected with a budget
- primitive-lock phase: one critical or two high primitives confirmed
- control-plane phase: admin/backend/database/file/debug surface available
- final-chain phase: stable exploit path identified
- retro phase: challenge solved or timed out and needs lesson extraction

If no high primitive is confirmed, route to recon or attack-queue, not primitive-lock.
If exploit-chain signals are already present, route to `ctf-web` with the current phase explicitly stated.

When two categories are close, choose the action that increases information across both branches, such as source route mapping for Web plus Crypto, `file`/`strings` for Rev plus Crypto, or archive listing for Forensics plus Rev.

## Output Contract

Write this to `notes.md` before deep solving:

```markdown
# Triage

## Observed Artifacts
| Artifact | Evidence | Possible categories |
|---|---|---|

## Category Score
| Category | Evidence | Confidence | Cheapest verification |
|---|---|---:|---|

## First Three Actions
1.
2.
3.

## Selected Next Step
- Command:
- Agent:
- Skills:
- Reason:
```

## Stop Conditions

Stop and ask when scope is unclear, the target appears non-CTF/non-authorized, or classification requires external scanning beyond the challenge environment.
