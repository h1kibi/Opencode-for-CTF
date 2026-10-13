# Skill Layer Contract

This document defines the stable contract for the bundled CTF skills. `SKILL.md` remains the executable instruction surface; this file defines how skills are organized, loaded, and handed off so that new skills do not grow into duplicate orchestrators.

## Layer model

| Layer | Current skills | Owns | Must not own |
| --- | --- | --- | --- |
| Control | `ctf-common`, `ctf-router`, `ctf-lead`, `ctf-decision-engine`, `ctf-experience-gate`, `ctf-ledger-discipline`, `ctf-closure-gate` | Scope, routing, phase ownership, ranking, state, closure | Category payloads or long exploit recipes |
| Orchestrator | `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, `ctf-misc` | One category's phase machine, dispatch, evidence, pivot, and final handoff | Global ranking/state doctrine or every vulnerability detail |
| Focused | `ctf-web-*`, `ctf-forensics-*`, `ctf-rev-*`, and other leaf skills | One technique, artifact, or bounded sub-discipline | Re-routing the entire challenge or redefining closure rules |
| Support / policy | `ctf-terminal`, `ctf-artifact-analysis`, `ctf-oob-discipline`, `ctf-whitebox-audit`, `anysearch` | Tool safety, artifact interpretation, retrieval, or cross-cutting policy | Becoming the default category orchestrator |
| Reference | `references/*.md` | Detailed recipes, matrices, and fallback knowledge loaded on demand | Acting as an independently dispatched skill |

### Ownership rules

1. `ctf-router` selects the initial lane and category; it does not solve.
2. `ctf-lead` coordinates the active phase and owner; it does not replace the router or category orchestrator.
3. `ctf-common` defines shared scope, evidence, reproducibility, and safe execution rules.
4. `ctf-decision-engine` ranks hypotheses and probes; it does not execute probes or mutate evidence state by itself.
5. `ctf-ledger-discipline` owns compact state refresh and resume hygiene; it does not invent payloads.
6. `ctf-closure-gate` starts only after a meaningful primitive or equivalent control boundary is confirmed.
7. A category orchestrator owns category-specific dispatch and escalates to another category only with evidence.
8. A focused skill may return `continue`, `pivot`, `escalate`, or `close`; it must not silently change the global phase. Its parent orchestrator remains responsible for phase transitions.

## Required skill contract

Every orchestrator and every newly created focused skill must expose these concepts in its body. The Web and Forensics focused families have been normalized to this contract. Other existing leaf skills may be migrated incrementally, but they must at minimum keep a trigger-oriented frontmatter description and an explicit output/stop contract.

| Contract field | Required meaning |
| --- | --- |
| **Load when** | Concrete evidence or phase that activates the skill. |
| **Do not load when** | The nearest non-matching case, especially a broader orchestrator that should own routing. |
| **Required inputs** | Facts, artifacts, and state required before the first probe. |
| **First safe action** | The smallest reversible/read-only action to establish signal. |
| **Dispatch / handoff** | Which skill or agent receives the result, and under what condition. |
| **Output contract** | A compact, machine-friendly result with facts, uncertainty, next action, and status. |
| **Stop conditions** | Conditions that end the skill, mark it blocked/dead, or require escalation. |

Use these exact headings for new or normalized skills:

```markdown
## Load When
## Do Not Load When
## Required Inputs
## First Safe Action
## Dispatch / Handoff
## Output Contract
## Stop Conditions
```

A skill may use a more specific existing section such as `## Inputs` or `## When to Pivot`, but the missing contract field must still be obvious and unambiguous. Do not duplicate the full contract in every reference file.

## Handoff result

When a skill returns control, write one compact result:

```yaml
status: continue | pivot | escalate | close | blocked | dead
owner: <agent-or-skill>
phase: <current-phase>
facts: []
uncertainties: []
strongest_signal: <one sentence>
next_action: <one reversible action>
stop_reason: <required for blocked/dead/close>
```

`facts` contain observed evidence only. `uncertainties` contain hypotheses that still need a discriminator. A handoff must never report a guessed flag as a fact.

## Loading policy

- Load one control skill and one category orchestrator by default; add focused skills only for an observed signal.
- Prefer the runtime facade/tool named by the orchestrator before direct low-level tools.
- Load one reference index before selecting a reference family; load the smallest matching reference after that.
- Do not load all Web leaf skills, all references, or all tool packs during initial triage.
- On pivot, preserve the evidence packet and state why the old owner was released.

## Review checklist

Before adding or substantially changing a skill, verify:

- Its frontmatter description says what it does and when to use it.
- Its layer and owner are clear from the body.
- Its first action is safe and bounded.
- Its output can be consumed by the next skill without prose reconstruction.
- Its stop/pivot conditions prevent payload roulette and duplicate dispatch.
- Its references are loaded on demand and have provenance.
- It does not duplicate a control skill or category orchestrator.
