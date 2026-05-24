---
name: ctf-web-deser
description: Use for authorized Web CTF challenges involving serialized object blobs, Java ObjectInputStream, PHP unserialize, Python pickle, .NET deserialization, or structured object injection (YAML, JSON based).
compatibility: opencode
---

# CTF Web Deserialization

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
