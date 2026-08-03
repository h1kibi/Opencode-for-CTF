---
name: ctf-skill-repo-knowledge
description: Use for evidence-based CTF pattern recall from the pinned SecKnowledge mirror or local curated knowledge. Do not activate external skills, copy writeups, trust payloads, or bypass local flag-oracle and evidence contracts.
compatibility: opencode
---

# CTF Skill Repo Knowledge

## Source and boundary

The pinned external reference mirror is:

```text
<repo>/skills-external/secknowledge-skill
{env:OPENCODE_CONFIG_DIR}\\opencode-for-ctf\\skills-external\\secknowledge-skill
```

Provenance is recorded in:

```text
rag/knowledge/sources/secknowledge-skill.manifest.json
```

SecKnowledge is a **reference corpus**, not the local CTF category orchestrator. Do not add it to `skills.paths`; its broad `ctf-web`, `ctf-pwn`, and `ctf-crypto` names can shadow or conflict with local skills. Use `ctf-lesson-search` first for local failure memory, `ctf-pattern-card-search` second for compact decision cards, and `ctf-skill-repo-search` third for full-text external context.

Local rules always win over external notes, especially:

- authorization and lab/scope boundaries;
- evidence-board and stop/pivot contracts;
- Windows/PowerShell fallbacks;
- the `untrusted_hint -> flag_candidate -> oracle_verified -> closed` flag lifecycle;
- the requirement that only an independent oracle may authorize success or `agent_flag.txt`.

## What the external corpus adds

Use it to supplement gaps in:

- Web SSRF, internal-service discovery, URL/parser differences, redirects, and cloud/container boundaries;
- deployment security, file upload, traversal, XXE, deserialization, template injection, and RCE chains;
- modern protocols, WAF/parser differentials, and framework-specific behavior;
- AI application, agent, MCP, RAG, prompt-injection, tool-boundary, and deployment security patterns;
- general web-to-host pivot hypotheses when local evidence shows a trust-boundary or closure problem.

Do not use it as a replacement for `ctf-web`, `ctf-pwn`, `ctf-misc`, `ctf-common`, or category-specific tools. It is less authoritative for challenge-specific routing, CTF flag handling, binary exploitation mechanics, and local runtime/tool availability.

## Retrieval workflow

Convert external notes into a bounded decision record:

```text
trigger -> first_safe_check -> oracle -> stop_rule -> pivot_rule
```

1. Record the observed artifact and the current constraint equation.
2. Query with at least two concrete terms: primitive, sink/source, trust boundary, parser, protocol, version, artifact, error, or oracle.
3. Prefer a local lesson or pattern card. Search SecKnowledge only when those are absent, weak, or too generic.
4. Read the smallest relevant section; do not load the whole catalog.
5. Reject any exact flag, secret, credential, challenge answer, or live-target data from the result.
6. Run one safe, reversible, read-only check before any exploit or pivot.
7. Record the independent oracle and the condition that closes the branch.

Useful external-oriented queries:

```text
category=web query="fetcher url parser redirect private service oracle"
category=web query="upload filename content-type storage execution boundary"
category=web query="container deployment env metadata internal service"
category=web query="xxe entity parser outbound file oracle"
category=web query="deserialization framework version gadget sink"
category=web query="agent mcp rag prompt injection tool boundary"
category=misc query="internal service discovery credentials privilege boundary"
```

Avoid title-only or answer-seeking queries:

```text
query="<challenge title> writeup"
query="<challenge title> flag"
query="<challenge title> solution"
```

## Mandatory search moments

Search the reference corpus when:

- two same-family probes produce no new differential;
- source shows a precheck/sink split or parser/semantic mismatch;
- an internal-network, container, deployment, or privilege boundary is visible but the next safe check is unclear;
- a web primitive may chain into file read, SSRF, upload, deserialization, or RCE;
- an AI/agent/MCP/RAG trust boundary is part of the challenge;
- the solver is about to begin broad enumeration, fuzzing, or a long manual branch;
- a high-value primitive exists but closure or ownership is unclear.

## Result extraction contract

For every useful hit, extract only:

```markdown
Pattern source: <relative path>
Trigger matched: ...
First safe check: ...
Expected oracle: ...
Stop rule: ...
Pivot if: ...
Next tool/subagent: ...
```

If the result suggests a flag-shaped string, classify it only as `flag_candidate` with source/context. Never announce it as the answer without an independent exact/file/service oracle. Ordinary hashes remain ordinary hashes unless their origin explicitly identifies a flag artifact such as `flag.txt`, `.flag`, `/flag`, `readflag`, or `getflag`.

If no result is useful, return to `ctf-experience-gate`, update the constraint equation, and choose the smallest discriminating probe instead of guessing.

## Category heuristics

- `web`: SSRF/internal network, auth/access, JWT/OAuth, upload, parser mismatch, template injection, XSS/admin bot, deployment/container/cloud.
- `pwn`: overflow, ROP, shellcode, format string, heap, FSOP, seccomp, kernel; prefer local PWN cards for exact mechanics.
- `reverse`: anti-analysis, VM/bytecode, language/runtime specifics, tracing, symbolic execution.
- `crypto`: RSA, AES modes, ECC, lattice/LWE, PRNG, hash/MAC, padding oracle, ZKP.
- `forensics`: disk, memory, network, stego, media, Windows/Linux artifacts, signals/hardware.
- `misc`: pyjails, bashjails, encodings, QR/audio/RF, games/VMs, DNS, platform navigation, internal-service clues.

## Shared skill contract

## Load When

Load only when the trigger is evidenced in the current authorized CTF branch and local lessons/cards are insufficient.

## Do Not Load When

Do not load for generic security explanations, title-only writeup lookup, unauthorized targets, or when local lessons/cards already answer the bounded question.

## Required Inputs

Provide authorized scope, relevant artifacts/evidence, current hypothesis, and tool/environment constraints.

## First Safe Action

Record the hypothesis and perform the smallest bounded, reversible check that can distinguish it.

## Dispatch / Handoff

Include scope, evidence, hypothesis, bounded next action, risks, expected oracle, and expected output format.

## Output Contract

Return confirmed facts, evidence references, rejected alternatives, risk, and one recommended next action.

## Stop Conditions

Stop when scope, authorization, evidence, or required capability is missing; pivot or escalate rather than guessing.
