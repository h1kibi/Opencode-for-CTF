# partial RELRO GOT write queue

## Trigger
- Partial RELRO is present and a write primitive may exist.
- The branch is overcommitting to GOT overwrite before proving a safe read/leak or target path.

## Why it looks promising
- GOT overwrite can be short on medium targets, but only when the write primitive, call-site consumer, and closure argument path are real.

## What usually goes wrong
- The solver treats writable GOT as automatic closure and skips lower-risk leak or direct read paths.

## Better question
- Does the current primitive prove a meaningful GOT write path, and is it shorter than leak-first or direct read closure?

## First safe check
- Prove the write primitive, prove the target function is later called with a useful argument path, and compare against read/leak closure before promoting GOT overwrite.

## Oracle
- A concrete writable target and consumer path exist, or the route is demoted behind leak/read closure.

## Stop rule
- Do not promote GOT overwrite to primary closure just because RELRO is partial.

## Pivot rule
- If target consumer control is weak or irrelevant, rerank to ret2libc, data-only output hijack, or direct file-read.
