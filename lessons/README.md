# Lessons

Store distilled reusable CTF lessons here.

Recommended lesson families:

- `closure-*.md` — primitive-to-flag / endgame playbooks
- `failure-*.md` — failure signatures and anti-drift corrections
- `anti-pattern-*.md` — strategically weak branches and negative knowledge
- `owner-*.md` — mixed-surface owner and handoff heuristics
- `web-*.md`, `pwn-*.md`, `rev-*.md`, `crypto-*.md`, `forensics-*.md` — category-specific atomic lessons

Preferred lesson style: one lesson = one reusable decision unit, not a full writeup.

Recommended structure:

## Trigger
## Why it looks promising
## What usually goes wrong
## Better question
## First corrective probe
## Stop rule
## Reuse query terms

Expected naming examples:

- `closure-source-leak.md`
- `closure-file-read.md`
- `failure-medium-value-primitive-drift.md`
- `owner-web-java-handoff.md`

Structured index contract for `knowledge/lessons/lessons.index.json`:

- `id`
- `file`
- `family`
- `category`
- `title`
- `triggers`
- `signals`
- `better_question`
- `stop_rule`
- `query_terms`

Recommended optional fields when the lesson changes queue, owner, or closure behavior:

- `promote_if`
- `demote_if`
- `related_pattern_queries`
- `related_failure_signatures`
- `related_owner_lessons`
- `related_closure_lessons`
- `suggested_control_action`
- `budget_penalty`
- `owner_flip_trigger`
- `closure_owner_hint`
