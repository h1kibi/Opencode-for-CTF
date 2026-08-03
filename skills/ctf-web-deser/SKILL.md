---
name: ctf-web-deser
description: Use for authorized Web CTF challenges involving serialized object blobs, Java ObjectInputStream, PHP unserialize, Python pickle, .NET deserialization, or structured object injection (YAML, JSON based).
compatibility: opencode
---

# CTF Web Deserialization

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching deser signal; do not use it for generic Web recon.

## Purpose

Use when challenge involves serialized object blobs, base64-encoded serialized data, or known serialization libraries (Jackson, Fastjson, XStream, SnakeYAML, pickle, unserialize).

## Signals

- Base64 blobs starting with `rO0` (Java serialization)
- Strings starting with `O:` or `a:` (PHP serialization)
- Python pickle magic bytes
- Cookie or parameter containing serialized-looking data
- JWT-like custom tokens that decode to structured objects

## Rules

- Identify the serialization format and library first.
- If source is available, find the gadget chain before generating payloads.
- Do not blindly generate destructive payloads.
- Prefer read-file or low-risk proof before full RCE.
- For Java: check dependencies for known gadgets (commons-collections, Spring, Fastjson, Jackson).
- For PHP: check for magic methods and phar wrapper.

## Output Contract

```markdown
# Deserialization Map

| Location | Format | Library | Gadget Available | Sink | Primitive |
|---|---|---|---|---|---|
```
