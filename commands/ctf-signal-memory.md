---
description: CTF helper: Maintain high-value signal memory, unresolved signal debt, and terminal candidates across the whole solve
agent: ctf-master
subtask: false
---

# /ctf-signal-memory - High-Value Signal Memory

Use when high-value clues may be forgotten, after meaningful recon, after a primitive is confirmed, when closure stalls, after 2-3 low-progress probes, before pivoting, before declaring failure, or when resuming a challenge.

Input state / observations:
$ARGUMENTS

## Purpose

This command protects high-value signals from being lost in branch momentum. It is not a long report; it is a compact working-memory refresh that should guide the next probe.

## Output schema

```yaml
confirmed_assets:
  - evidence: ""
    value: "what it enables"
    role: terminal|bridge|support|unknown

high_value_signals:
  - id: S1
    evidence: "exact observed clue: file/class/route/header/error/annotation/output"
    family: swagger|deserialization|source_leak|config|admin|auth|file_read|file_write|ssrf|template|sql|upload|jwt|parser|debug|control_plane|crypto|pwn|forensics|other
    priority: P0|P1|P2|P3
    status: unresolved|tested|confirmed|blocked|killed|deferred|supporting
    why_high_value: "why this may shorten flag path"
    first_probe: "one low-noise check"
    flag_path_distance: 1|2|3|4
    revisit_trigger: "when to bring it back"
    kill_condition: "what evidence would kill it"

signal_debt:
  unresolved_P0_P1_P2_count: 0
  must_pay_before_more_same_family: true|false
  highest_debt: S1

terminal_candidates:
  - id: T1
    path: "signal/primitive -> chain -> flag"
    evidence: ""
    blocker: ""
    next_probe: ""
    flag_path_distance: 1|2|3|4
    owner: web|java|pwn|rev|crypto|forensics|misc

weak_or_killed_branches:
  - branch: ""
    reason: "flat/null/no oracle/blocked/falsified"
    revive_if: ""

attention_refresh:
  confirmed_assets: "one line"
  unresolved_high_value_signals: "one line"
  best_terminal_candidate: "one line"
  weak_branch_to_stop: "one line"
  next_one_variable_probe: "one line"
```

## Priority rules

- P0: direct flag, RCE, admin/session/token with known sensitive endpoint, source/config/secret, unrestricted flag-like data.
- P1: route/control-plane/source/config/privileged surface: Swagger/OpenAPI, Actuator, H2, Druid, GraphQL introspection, admin/debug/source leak, exposed backup/git.
- P2: strong exploit-family signal: ObjectInputStream/readObject/rO0AB/aced, unsafe parser, template sink, file upload+readback, SSRF fetcher, SQL concat, command sink, path traversal, JWT signing clue, prototype pollution merge.
- P3: supporting clue: version, stack, generic error, credentials without endpoint, table names, path hints, dependency name without reachable route.

## Decision rules

- An unresolved P0/P1/P2 is signal debt. Do not continue same-family variants after low progress while debt remains.
- The first confirmed primitive is `support/bridge` by default unless it directly shortens the flag path to distance <= 2.
- Rank terminal candidates by shortest stable flag path, not by the first vulnerability found.
- If 2-3 probes produce no legitimate progress, pay down signal debt before another payload/path variant.
- Author-provided clues are intentional priors unless disproven: challenge title, attachment names, test classes, annotations, custom utility classes, sample creds, odd dependencies, comments, and route names.
- When a compact evidence trail exists, refresh this memory from `work/ctf-evidence/<challenge-slug>/route.json`, `primitive.json`, and `closure.json` before relying on conversational memory alone.

## Return style

Return only the YAML block plus one sentence: `NEXT: <exact one-variable probe>`.
