---
description: CTF entry: OMO-style CTF route gate for authorized challenges; classify target and choose first safe tool without exploiting
agent: ctf-expert
subtask: false
---

Soft-deprecated helper note:
- Prefer `/ctf` as the standard route-only front door.
- Keep `/ctf-route` only when you explicitly want the narrow route-gate contract and nothing else.

Run the CTF Route Gate only.

Challenge info:
$ARGUMENTS

Rules:
- Treat this as an authorized CTF/lab/local challenge only.
- Do not exploit, fuzz broadly, or run state-changing actions.
- Use the Evidence Route Matrix before choosing tools:
  - URL-only Web -> `ctf-web-fingerprint`, then `ctf-web-blackbox-map mode=light`; forbidden first actions: broad fuzzing, payload spraying; pivot trigger: no routes/signals after safe map.
  - Web source tree -> load/use `ctf-whitebox-audit`, then `ctf-web-source-map`; if Java/Spring/JAR/WAR -> `ctf-web-java`/Java map tools; forbidden first actions: blind HTTP payload variants before route/sink/auth/evidence map.
  - Source/archive/bytecode/config leak -> build a DeepAudit-style audit handoff first: stack, entrypoints, auth boundaries, sources, sinks, sanitizers, candidate findings, false-positive checks, and top-3 probes; forbidden first actions: reporting unverified scanner hits as confirmed.
  - SPA/JS/API clues -> `ctf-web-js-surface-map`; runtime/admin-bot/CSP/storage clues -> `ctf-web-runtime-map`; forbidden first actions: generic XSS payloads before reflection/runtime context.
  - Upload/archive/file path clues -> `ctf-web-template-check` or source-map focused on upload/path sinks; forbidden first actions: destructive overwrite or webshell assumptions before canary/output channel.
  - GraphQL/JWT/OAuth/WebSocket clues -> route to matching specialized skill/tool family before generic Web probing.
  - ELF/native/libc/checksec clues -> `ctf-binary-probe`, then route pwn vs rev; forbidden first actions: exploit writing before mitigations, input shape, and crash/control evidence.
  - APK/JAR/class/obfuscation clues -> `ctf-one-shot-triage` then rev/Java bytecode mapping; forbidden first actions: full decompilation before strings/entrypoint triage unless needed.
  - RSA `n/e/c`, keys, signatures -> `ctf-rsa-probe`; forbidden first actions: custom math scripting before known weakness probe.
  - PCAP/PCAPNG -> `ctf-pcap-probe`; media/document -> `ctf-stego-probe`; archive -> `ctf-safe-extract` then triage extracted tree.
- If artifacts exist, prefer exactly one cheap triage/probe over manual enumeration.
- Include a recommended solve profile: `speedrun`, `hard`, `safe-web`, `pwn-local`, or `forensics-direct`.
- Include a model profile recommendation only as advice: `current-ok`, `large-context`, `deterministic-reasoning`, `coding-heavy`, or `fast-triage`; do not switch models automatically.
- Preferred entrypoint note: `/ctf` is the normal route-only front door. `/ctf-route` is the thinner explicit route gate for operators who already know they only want routing output.

Return compactly:
1. Category and confidence.
2. Target/scope constraints.
3. Evidence route matrix row used.
4. First safe tool/probe.
5. Forbidden first actions.
6. Top-3 initial hypotheses.
7. White-box handoff requirement if source-like artifacts exist.
8. Evidence gate / local harness requirement for source-derived findings.
9. Pivot trigger.
10. Recommended solve profile and model profile.
11. Whether to invoke `ctf-scout`, `ctf-librarian`, or a specialized subagent next.
