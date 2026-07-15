---
name: ctf-oob-discipline
description: Use when an authorized CTF branch needs blind/OOB confirmation, DNS/HTTP callbacks, Interactsh, webhook fetchers, XXE external DTD, SSRF callbacks, JNDI/LDAP/RMI, reverse-shell-only closure, or any public callback infrastructure decision.
compatibility: opencode
---

# CTF OOB Discipline

## Trigger

Load this skill only after evidence indicates a blind or OOB-dependent branch:

- Blind SSRF, XXE, template/render fetchers, webhooks, URL previewers, image/PDF converters, admin bots, DNS lookups, Log4j/JNDI, Java deserialization callbacks, or reverse-shell-only command primitives.
- A probe requires a public DNS/HTTP/LDAP/RMI listener, VPS, tunnel, custom domain, or third-party collector.
- A branch is being considered confirmed from a timeout, unchanged response, or generic 200 without a real callback/writeback/timing oracle.

## Boundary

OOB is an evidence and closure channel, not a guessing style.

- Default to in-band, local harness, log/error, writeback, or timing oracles when they can answer the question.
- Use public Interactsh-style DNS/OOB canaries as the default low-friction callback channel when available.
- Ask the user before using custom callback domains, private collectors, VPS listeners, public HTTP servers, LDAP/RMI/JNDI servers, tunnels, or reverse shells.
- Do not use third-party OOB services for user/local machine secrets, personal credentials, or out-of-scope systems.

## Confirmation Rules

A blind/OOB segment is not confirmed by hope. Require one of:

1. Unique token callback mapped to `hypothesis -> route -> payload -> time`.
2. Timing differential outside jitter with baseline and mutant.
3. Writeback/readback controlled by the target.
4. Privileged-state differential caused by the target.
5. Local harness proof plus a live reachability check when live callback is blocked.

If the only evidence is timeout, hang, unchanged status/length, generic 404/403, or crash-only behavior, cap the branch at two one-variable probes, then mark it blocked or pivot.

## Token Ledger

For every OOB probe record:

| Token | Hypothesis | Route/Input | Protocol | Expected Callback | Observed | Verdict | Next |
|---|---|---|---|---|---|---|---|

Rules:

- One token per probe; never reuse tokens across hypotheses.
- Record protocol expectations: DNS-only, HTTP fetch, DTD fetch, LDAP/RMI/JNDI, SMTP, webhook, bot visit, or reverse shell.
- Separate receive-only collectors from response-serving infrastructure. External DTD XXE, staged JNDI, and file-serving payloads require a server that can return attacker-controlled content, not merely a callback log.

## Infrastructure Escalation Gate

Ask the user for resources when any of these are true:

- The payload must serve content back to the target: external DTD, staged script, JAR/class, serialized object, large file, exploit server.
- The target must connect to non-DNS protocols: LDAP, RMI, SMB, gopher, raw TCP, reverse shell.
- The closure requires high-volume exfiltration or long-lived listener state.
- The default collector is unavailable or insufficient.

Question format:

```text
This branch now needs <resource> because <specific gate>. Safe fallback without it is <fallback>. Please provide <endpoint/protocol/constraints> or confirm fallback.
```

## OOB Family Routing

- **SSRF / URL fetcher**: prove parser reachability with DNS/HTTP canary; then test in-band internal route only if allowed; avoid data exfil until closure path is explicit.
- **XXE**: identify parser and entity support; for external DTD, require response-serving HTTP; use small file reads first.
- **Log4j/JNDI**: verify log sink and JDK/protocol constraints before LDAP/RMI; do not start public infrastructure without user approval.
- **Admin bot / browser**: self-test payload locally, prove marker/writeback/callback, then use final payload once.
- **Deserialization callback**: require entry shape, classpath/gadget gate, and callback or writeback oracle before locking.
- **Command primitive**: prefer in-band `id`/file-read/writeback over reverse shell; reverse shell needs user-approved listener.

## Decision-State Contract

When an OOB branch is active, hypotheses should include:

```json
{
  "blindOrOob": true,
  "oracleEvidence": "callback token/writeback/timing evidence or empty if not yet confirmed",
  "risk": 2,
  "stateDamage": 1,
  "nextTest": "one unique canary with expected protocol and token ledger update",
  "killRule": "no callback/writeback/timing differential after two one-variable probes"
}
```

Use `ctf-decision-state operation=probe` before non-trivial OOB probes and `operation=observe` immediately after the callback window closes.

## Output Contract

Return only:

- OOB hypothesis and family.
- Required protocol/infrastructure.
- Token ledger row.
- Confirm/falsify oracle.
- Fallback if resource is unavailable.
- Decision-state update needed next.
