---
name: ctf-forensics-memory
description: Use for memory / RAM dump / hibernation file forensics — process analysis, injected code, network connections, and credential extraction.
compatibility: opencode
---

# CTF Forensics — Memory Analysis

## Stop Conditions

Stop before destructive extraction, when provenance would be lost, when the required tool/fallback is unavailable, or when the artifact class is falsified. Do not repeat equivalent extraction attempts without a new discriminator.

## Output Contract

Return confirmed evidence, uncertainty, source artifact/offset, command or tool used, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return artifact paths, hashes, offsets/streams, tool output, interpretation, and one next action to `ctf-forensics`; preserve provenance across any child artifact.

## First Safe Action

Hash and preserve the dump, identify its format and profile, then inventory processes/connections before extracting secrets.

## Required Inputs

Require the original artifact, hash/provenance, acquisition constraints, current forensics phase, and the exact extraction question.

## Do Not Load When

Do not load without the matching artifact class, and do not use this focused skill to replace `ctf-forensics` preservation, provenance, or phase ownership.

## Load When

Load when the artifact is RAM, a hibernation file, a crash dump, or a process/injection/credential reconstruction task.

## Trigger

Load when triage identifies: `.mem`, `.raw`, `.vmem`, `.dmp`, `hiberfil.sys`, `pagefile.sys`, or VM snapshots.

## Primary Tools

- `volatility 2` (`vol.py -f <dump> imageinfo --profile=<p> <plugin>`)
- `volatility 3` (`vol -f <dump> <plugin>`)
- `bulk_extractor` — fast parallel extraction

## Key Plugins

| Plugin | What It Finds |
|--------|---------------|
| `pslist` / `pstree` | Active processes |
| `cmdline` | Command-line arguments |
| `netscan` / `connections` | Network connections |
| `malfind` | Injected/hidden code |
| `hollowfind` | Process hollowing detection |
| `filescan` | Open file handles |
| `clipboard` | Clipboard contents |
| `cachedump` / `hashdump` / `mimikatz` | Credentials |
| `dumpfiles` | Extract process memory |
| `iehistory` / `chromehistory` | Browser history |
| `notepad` | Notepad text |
| `screenshot` | Desktop screenshot |

## Workflow

1. Identify profile (Volatility 2) or let Volatility 3 auto-detect
2. Scan for suspicious processes and injected code
3. Extract command-line history
4. Check network connections for exfiltration
5. Dump interesting process memory
6. Search for flag strings across the dump
