---
name: ctf-artifact-analysis
description: Use for analyzing challenge artifacts (source, binary, ELF, APK, archive) to extract entrypoints, sinks, secrets, and structural hints for all CTF categories.
compatibility: opencode
---

# CTF Artifact Analysis

## Purpose

Use this skill to get a structured first look at any challenge artifact — source code, binary, APK, pcap, archive, or unknown file. It extracts the information needed to choose an exploit strategy without manual triage.

## How to Use

1. Run `ctf-artifact-analyze build target=<path>` to build the intermediate representation (IR).
   - IR is stored under `work/analysis/<slug>/artifact.db.json`
2. Run `ctf-artifact-analyze query slug=<slug> ruleset=<rule-id>` to find specific vulnerability classes.
3. Read `work/analysis/<slug>/artifact.db.json` directly for full data.

## Scope

Use on any provided CTF challenge artifact — source directories, binaries, APKs, archives, pcaps, or unknown files. Do not use against production or third-party systems.

## Workflow

1. Receive challenge files.
2. Run `ctf-artifact-analyze build` on the primary artifact or the challenge directory.
3. Review the output: file type, language, entrypoints, sinks, secrets, and hints.
4. Choose a ruleset based on the artifact type and language:
   - Web source → `command-injection`, `sqli`, `ssti`, `ssrf`, `deser`, `path-traversal`
   - Binary ELF → review protections, strings, interesting imports
   - APK → review entrypoints, native libs, sinks
   - Crypto source → `weak-crypto`
   - Unknown → let the kind/hints guide your choice
5. Use the findings to inform your exploit or solve strategy.

## Reference

Audit rules are stored in `knowledge/audit-rules/`. Load `REFERENCE_INDEX.md` for the full rule index.
