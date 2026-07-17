---
name: ctf-forensics-memory
description: Use for memory / RAM dump / hibernation file forensics — process analysis, injected code, network connections, and credential extraction.
---

# CTF Forensics — Memory Analysis

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
