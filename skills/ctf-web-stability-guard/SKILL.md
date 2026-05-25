---
name: ctf-web-stability-guard
description: Use before any state-changing action. Enforces batch test gates, write/overwrite gates, high concurrency gates, bot payload gates, canary placement, rollback planning, and stop conditions to prevent damaging the target.
compatibility: opencode
---

# CTF Web Stability Guard

## Purpose

Prevent the agent from crashing, deadlocking, corrupting, or destabilizing the challenge instance during exploitation. Every state-changing action must pass through this gate.

## Batch and Destructive Testing Gate

Treat these as high-risk actions:

- More than 20 HTTP requests in one script.
- Any concurrency greater than 1.
- Wordlist fuzzing.
- Directory brute force.
- SQL dump automation.
- Repeated admin-bot triggers.
- Repeated uploads.
- File overwrite attempts.
- Service restart.
- Container mutation.
- Large payloads.
- Race-condition loops.
- Long-running timing probes.
- Custom Python, Node, Bash, or browser-automation scripts.

This gate also applies to custom scripts.

A custom script is high-risk if it:
- Sends more than 20 HTTP requests.
- Uses concurrency.
- Repeatedly triggers bots.
- Repeatedly uploads files.
- Attempts SQL dumping.
- Mutates backend state.
- Performs file write or overwrite.
- Performs long-running timing probes.

Such scripts require a High-Risk Action Plan before execution.

Before any high-risk action, write this plan in `notes.md`:

```markdown
# High-Risk Action Plan

Action:
Why needed:
Expected information gain:
Why safer options are insufficient:
Request count:
Concurrency:
Timeout:
State changes:
Rollback/recovery:
Stop condition:
```

## Default Limits

- Concurrency: 1.
- Timeout per request: 3-5 seconds.
- Maximum initial batch: 20 requests.
- Maximum upload/write canaries: 2 before reassessment.
- Maximum bot-triggering payloads: 2 before reassessment.
- No destructive batch tests unless the final chain is locked.

## File Overwrite Guard

Before overwriting any existing file:

1. Read and save the original content when possible.
2. Record the original hash or length.
3. Use a unique marker canary first.
4. Prefer appending only if semantics are known safe.
5. Do not overwrite core files unless the final chain is locked.

## Risk Classification

| Action | Risk | Required Guard |
|---|---:|---|
| read-only request | low | record result |
| harmless form submission | low/medium | use unique marker |
| session reuse | medium | preserve original cookie |
| upload/write canary | medium | write reversible marker only |
| overwrite existing non-core file | medium/high | prove reload/import path first, save original content |
| overwrite route/config/settings file | high | final step only, chain must be locked |
| sync browser request to localhost/dev server | high | avoid unless proven safe |
| mass fuzzing or high concurrency | high | avoid by default |
| service restart/container mutation | high | ask or defer |

## Protocol and Cache Layer Rules

- Protocol-layer tests can easily break connection state; forbid high concurrency.
- Prefer local reproduction.
- If the action affects global cache, record rollback and stop conditions.

## Instance Stability

If the target becomes slow, inconsistent, or returns repeated 5xx errors, stop probing and reassess instance stability.

## Browser MCP Risk Gate

Browser MCP actions are high-risk when they:

- Trigger admin bots.
- Submit state-changing forms.
- Upload files.
- Inject scripts.
- Send custom browser-side requests.
- Start network debugger capture on sensitive non-challenge tabs.
- Access history, bookmarks, cookies, or tabs unrelated to the challenge.
- Repeat payloads or interactions more than the focused-probe budget allows.

Before high-risk browser MCP actions, write a High-Risk Action Plan in `notes.md`.

Default browser MCP limits:

- Maximum bot-triggering payloads: 2 before reassessment.
- Maximum state-changing form submissions: 2 canary submissions before reassessment.
- No script injection unless the current phase is focused-probe or later.
- No browser MCP use for broad fuzzing.
- No history/bookmark access during CTF solving.

## Output Contract

Write this to `notes.md`:

```markdown
# Stability Guard

- State-changing action planned:
- Canary test:
- Rollback/recovery:
- Why lower-risk options are insufficient:
```
