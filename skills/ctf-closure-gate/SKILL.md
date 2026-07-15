---
name: ctf-closure-gate
description: Use after a high-value primitive is confirmed to force primitive-to-flag convergence, flag-location modeling, closure-probe ranking, and anti-drift endgame discipline for hard CTF challenges.
compatibility: opencode
---

# CTF Closure Gate

Use this skill when a challenge already has a confirmed high-value primitive, but the flag is not yet in hand. The goal is to convert capability into the shortest stable flag-recovery path.

This skill is not for discovery. It is for endgame convergence.

## Source of Truth

`ctf-rigorous` is the normative source of truth for fast-path, closure override, and low-noise endgame behavior. This skill should refine closure moves, not redefine the global discipline.

## When To Use

Load this skill when any of the following is true:

- A high-value primitive is confirmed and the flag is not already directly reachable in one obvious step.
- The exact flag location or retrieval path is still unclear.
- The solver is tempted to resume broad recon even though a plausible primitive-to-flag path already exists.

Do not load this skill for pre-primitive recon or vague differentials.

## Core Role

When active, do only four things:

1. Build or refresh a Flag Location Model.
2. Rank the shortest retrieval paths from the current privilege boundary.
3. Choose the top closure probe.
4. Re-rank after the result.

If an obvious low-noise direct win exists, let `ctf-rigorous` fast-path rules win and take it immediately.

## Sufficiency Rule

In closure work, **sufficiency outranks completeness**.

- If the current evidence already supports a standard exploit / retrieval template, prefer committing to the shortest stable closure path over explaining every remaining local detail.
- Do not keep spending closure budget on prettier local semantics unless the added work shortens the path, falsifies the current template, or upgrades the closure owner.

## Closure Normal Form

Before ranking more closure probes, compress the current branch into this compact card:

```text
control: saved_rip | saved_rbp | stack_pivot | aar | aaw
code_addr: fixed | pie | n/a
writable_memory: none | stack | heap | bss | global
replay: yes | no
leak_surface: puts_got | printf_got | show_path | fmt_read | none
closure_template: ret2win | pivot+bss | leak+replay | orw | shell | data_only | read_path
```

Rules:

- Once the card is filled, later closure probes should refine or falsify it rather than restart free-form exploration.
- If the card already matches a standard closure family, that family is the default candidate until an oracle disproves it.
- If new reasoning does not change this card or shorten the closure path, it should be demoted.

## Canonical Closure Priority

When the closure-normal-form card is available, rank shortest stable templates in this default order unless stronger evidence overrides it:

1. `ret2win` / direct read / direct secret path
2. `pivot -> writable static/global memory`
3. `single leak -> replay`
4. `ORW` / direct file-read path
5. `interactive shell`

If a higher-priority template is still alive and has not been concretely falsified, do not widen into a lower-priority or more stateful closure route.

## Minimum Solve Sketch Gate

Ask once after primitive lock:

> If only 20-40 lines of solve / exploit were allowed, what is the shortest plausible skeleton now?

If this can already be answered with a concrete control path, writable target, leak/replay plan, or final read path, the branch is in real closure mode. Do not continue large-scale explanatory modeling unless it shortens that sketch or falsifies it.

## Flag Location Model

Build a compact model with these fields only:

- `primitive`
- `source_primitive`
- `execution_primitive`
- `exfil_primitive`
- `closure_owner`
- `current_boundary`
- `flag_location_type`
- `storage_candidates`
- `read_paths`
- `best_oracle`
- `blockers`
- `requires_oob`
- `oob_protocol`
- `oob_canary_plan`
- `top_2_closure_probes`

Prefer one of these explicit `flag_location_type` values when possible:

- `flag_file`
- `env_secret`
- `database_row`
- `admin_only_page`
- `other_user_object`
- `bot_dom_secret`
- `internal_service_response`
- `source_or_config_secret`
- `workflow_output`
- `side_effect_observable_secret`

Do not add long prose.

## Primitive Reclassification and OOB Closure

A confirmed primitive is not automatically the closure owner. Before spending more closure budget, classify the current path:

- `source_primitive`: reveals code/config/routes/dependencies, such as LFI/source leak.
- `execution_primitive`: triggers the sink/consumer, such as parser, renderer, template, deserializer, fetcher, upload processor, or code execution.
- `exfil_primitive`: returns or exports the secret, such as direct response, file writeback, callback/OOB, database read, or privileged page.

If a source primitive is blocked by a path/keyword/filter but source evidence reveals a controllable parser/fetcher/renderer that can read or export the same secret, hand closure ownership to the higher-order sink. Do not keep probing local-read aliases after two same-family failures unless the alias creates a new oracle or materially shortens the flag path.

When `requires_oob=true`, the top closure probes must be ordered as: callback canary -> parser/fetch expansion confirmation -> target secret exfiltration -> clean verification. Ask for or configure public callback infrastructure before final exfiltration; use in-band/log/writeback only as fallback when OOB is unavailable.

## Bridge Primitive vs Closure Primitive

After primitive lock, explicitly distinguish:

- `bridge primitive`: continues interaction/control but does not directly reduce flag distance, such as one more read, one more replay, or one more buffer rewrite.
- `closure primitive`: directly advances the shortest final path, such as fake-stack pivot, direct leak, ORW, output hijack, or direct read-flag path.

Default rule: closure primitive outranks bridge primitive. A bridge primitive may stay top-ranked only if it is required by the currently selected canonical closure template.

## Over-Complexity Warning Signs

Treat the branch as likely overcomplicating when one or more of these are true:

- fixed code address, writable static/global memory, pivot/control-transfer primitive, leak path, and replay are already present, yet the branch still spends rounds on local slot/object recovery;
- two successive rounds explain bridge steps or local semantics but do not shorten the final chain;
- a standard template like ret2win, fake-stack pivot, one leak + replay, ORW, or direct read-path is already visible, but the branch is still handled as unknown bespoke closure;
- “just one more confirmation” becomes the default move after the primitive and closure cards are already strong.

When a warning sign appears, prefer closure compression and reranking over more explanation.

## Primitive-Specific Closure Guidance

Use primitive-specific endgame instincts only as tie-breakers after the global `ctf-rigorous` closure rules are satisfied:

- command/code execution -> low-noise identity/location checks and likely flag paths first
- file read/LFI -> likely flag paths, then config/source/deployment, then only clearly useful runtime files; if LFI/source reveals a controllable parser/fetcher with weak in-band output, downgrade LFI to `source_primitive` and evaluate OOB/writeback closure before more path aliasing
- SQL/database read -> schema-guided minimal enumeration, flag/secret/admin/config-like names first
- admin/session access -> admin-only pages, settings/export/debug/report/backup/import/logs, then privileged APIs/object IDs
- SSRF/internal access -> internal admin/debug/config/flag endpoints first; if response is blind, promote DNS/HTTP callback canaries before repeated internal path guesses
- source/config leak -> backward-slice from flag paths, env vars, readflag scripts, privileged routes, and secret-bearing config; when the slice identifies a parser/renderer/fetcher sink, reclassify closure owner instead of continuing source-only enumeration
- browser/admin-bot execution -> decide whether the secret is in cookie, storage, DOM, admin-only page, or same-origin internal response

## Output Contract

Return compact endgame updates only:

- current primitive
- closure normal form
- current boundary
- best flag location hypothesis
- top closure probe
- result / next re-rank decision

Do not output broad theory. Produce closure moves.
