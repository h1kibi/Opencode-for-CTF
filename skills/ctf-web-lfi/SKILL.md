---
name: ctf-web-lfi
description: Use for authorized Web CTF local file inclusion and path traversal challenges involving file parameters, downloads, templates, static file handlers, zip slip, logs, or source disclosure.
compatibility: opencode
---

# CTF Web LFI

## Output Contract

Return a compact result containing confirmed facts, unresolved uncertainty, attempted discriminator, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching lfi signal; do not use it for generic Web recon.

## Purpose

Use when Web input may influence a file path. Focus on source review, minimal traversal probes, filter analysis, and justified file retrieval.

## Signals

- Parameters named `file`, `path`, `page`, `template`, `download`, `view`, `lang`, `theme`, or `include`.
- Source calls such as `open`, `readFile`, `send_file`, `include`, `require`, `render`, `ZipFile.extract`, or static path joins.
- Errors showing filesystem paths.
- Download endpoints or template selection.

## Workflow

1. Identify the path sink and base directory.
2. Establish a baseline valid file request.
3. Test minimal traversal with harmless known files or source-known paths.
4. Analyze normalization, extension appending, prefix checks, URL decoding, null byte handling, and Windows vs POSIX separators.
5. If source exists, prove bypass against the exact sanitizer.
6. Retrieve only challenge-relevant files: source, config, flag path hinted by challenge, logs, or environment files when in scope.
7. Write `solve.py` with final request sequence.

## Bypass Checklist

Check only when evidence suggests filtering:

- URL encoding and double encoding.
- Mixed separators: `/`, `\\`, `%2f`, `%5c`.
- Prefix and suffix checks.
- Extension appending and alternate extensions.
- Absolute vs relative paths.
- Symlink and static-root assumptions.
- Archive extraction paths.
- Framework static file helpers.
- Windows drive paths if the target is Windows.
- Null byte behavior only for old/runtime-specific stacks where it is plausible.

## Evidence Requirements

- Input parameter and sink.
- Baseline and traversal response.
- Filter/bypass explanation.
- Retrieved file path and why it is in scope.

## Stop Conditions

Stop when the next step is broad filesystem guessing, out-of-scope host file access, or repeated traversal variants without a new sanitizer hypothesis.
