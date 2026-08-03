---
name: ctf-web-primitive-lock
description: Use when a critical or high-value primitive is confirmed. Stops broad probing and locks onto the strongest confirmed primitive to prevent diverging from the exploit path.
compatibility: opencode
---

# CTF Web Primitive Lock

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Dispatch / Handoff

Return the locked primitive to `ctf-web-control-plane` and `ctf-closure-gate`; release unrelated focused skills.

## First Safe Action

Recheck the confirming response/oracle and write the strongest primitive before testing any new family.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after a critical primitive or two high-value primitives have an oracle-backed confirmation.

## Purpose

Once a critical primitive or two high primitives are confirmed, stop broad probing and switch from discovery to exploit-chain construction. This skill enforces the convergence gate.

## Primitive Ledger

Maintain this table in `notes.md` for every Web challenge once any non-trivial behavior is found:

| Primitive | Evidence | Strength | Best Use | Confirmed |
|---|---|---:|---|---|
| stored XSS | request/response/source/bot visit | high | admin session, admin-side action | yes/no |
| reflected/DOM XSS | browser evidence/source sink | medium | token/action under victim context | yes/no |
| admin bot | bot visit/user-agent/timing | high | privileged browser execution | yes/no |
| admin session/cookie access | cookie/backend page evidence | critical | stable authenticated control plane | yes/no |
| debug page/source leak | stack trace/debug page/source path | high | path discovery, config leak, session leak | yes/no |
| arbitrary file write | endpoint/source/effect | critical | code execution, template/static overwrite | yes/no |
| overwrite-only file write | failed create + successful overwrite | high | replace existing reloadable/imported file | yes/no |
| arbitrary/local file read | response/source/effect | critical/high | flag/config/source read | yes/no |
| SSRF | server-side request effect | high/medium | internal admin/debug access | yes/no |
| template/expression eval | rendered calculation/error/source | critical/high | code execution or file read | yes/no |
| SQL injection | DB error/timing/boolean/source | high | auth bypass, data read/write | yes/no |
| upload-to-execute | file URL/handler/source evidence | critical | code execution | yes/no |
| auth bypass / token forgery | cookie/session/JWT evidence | critical/high | admin session, other-user access | yes/no |
| mass assignment | JSON body/property evidence | high | privilege escalation, role change | yes/no |

## Strength Rules

- critical: directly gives code execution, arbitrary server file write, admin session, or arbitrary file read. Treat file read as critical when it can read arbitrary absolute paths, flag locations, secrets, source, or config.
- high: gives privileged context, durable stored execution, debug/source leak, SSRF to internal control surface, or database control. Treat file read as high when it is constrained to a narrow non-sensitive directory.
- medium: useful but requires another primitive.
- low: only informational or unreliable.

## Lock Rules

- If any critical primitive is confirmed, stop broad probing and build a chain around it.
- If two high primitives are confirmed, stop broad probing and combine them.
- If stored XSS + admin bot are confirmed, immediately attempt admin-session/control-plane acquisition.
- If file write is confirmed, immediately build a write matrix instead of guessing paths.
- If admin session is confirmed, prioritize backend control surfaces over blind exfiltration or speculative payloads.

## Stop Wasting Rule

- Do not try more than 3 variants of the same payload family unless the hypothesis changed.
- Do not continue blind callback variants after a stable authenticated/admin control plane is available.
- Do not keep fuzzing routes after source or debug output gives a better map.

## Output Contract

Write this to `notes.md`:

```markdown
# Primitive Ledger

| Primitive | Evidence | Strength | Best Use | Confirmed |
|---|---|---:|---|---|

# Strongest Primitive Lock

- Current strongest primitive:
- Evidence:
- Why this is stronger than alternatives:
- What branches should be stopped:
```
