# anti-pattern-rce-obsession-when-read-path-exists

## Trigger
- The solver keeps preferring shell or full code execution while a direct read path to flag/config/source likely exists.

## Why it looks promising
- RCE feels maximal and satisfying.

## Why it is strategically weak now
- In many CTFs, read is enough and much cheaper than execution.

## Better closure family
- file read, template read, config read, source-guided read, admin-only data read.

## Revisit trigger
- Direct read paths are blocked and execution is truly needed to cross privilege or path boundaries.
