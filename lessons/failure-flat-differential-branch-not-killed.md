# failure-flat-differential-branch-not-killed

## Trigger
- Several probes change payload strings or minor syntax, but results remain flat, noisy, or non-informative.

## Why it looked promising
- The family feels close, and each variant seems like a new attempt.

## Misleading signal
- Payload variance was mistaken for hypothesis variance.

## Earlier kill signal
- Same endpoint, same method, same location, same sink story, same oracle shape, no new differential.

## Better next probe
- Change one orthogonal variable: owner, parser, parameter location, content type, session state, route shape, or closure family.

## Stop rule
- Three no-differential same-family variants is a stale branch, not persistence.
