# Retros

Store generated Web CTF retrospective reports here.

Expected naming:

- challenge retros: `<challenge-or-date>.md`
- failure signature retros: `failure-<short-pattern>.md`

Recommended retro outputs:

## What was the real owner?
## Which branch should have died earlier?
## Which signal was misleading?
## Which primitive should have triggered closure sooner?
## Which lesson or patch should be extracted?

Recommended failure-signature extraction workflow:

1. Identify the strongest wrong branch that consumed meaningful budget.
2. Name the misleading signal that kept it alive.
3. Name the earlier kill signal that should have demoted it.
4. Extract one reusable `failure-*.md` or `anti-pattern-*.md` lesson.
5. If mixed-surface, decide whether an `owner-*.md` lesson is the better artifact.
