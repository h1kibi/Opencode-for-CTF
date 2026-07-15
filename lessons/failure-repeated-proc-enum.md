# failure-repeated-proc-enum

## Trigger
- `/proc`, `fd`, `environ`, `maps`, `hostname`, or startup-file exploration repeats without a new differential.

## Why it looked promising
- These paths sometimes win directly, especially after file read or LFI.

## Misleading signal
- Plausibility replaced evidence; each new path variant felt cheap enough to try.

## Earlier kill signal
- Two no-differential probes already showed the family was not paying rent.

## Better next probe
- Return to semantic mismatch, source-guided sink analysis, path/parser/content-type differential, or closure of the existing primitive.

## Stop rule
- Two no-progress environment/proc probes means the family is frozen until new evidence appears.
