# anti-pattern-pwn-blind-remote-before-local-oracle

## Trigger
- The challenge is remote or remote-first, and the solver is tempted to iterate on payloads without a reliable local crash, leak, or protocol oracle.

## Why it looks promising
- The remote service is live, and each attempt appears to provide quick feedback.

## What usually goes wrong
- Timeouts, EOFs, and connection resets get misread as exploit progress when the real issue is protocol drift, libc mismatch, or missing local proof.

## Better question
- What is the smallest local or scripted oracle that proves the current hypothesis before more remote mutation?

## First corrective probe
- Reproduce the current branch locally, or build one deterministic scripted remote oracle that distinguishes prompt sync, crash, timeout, and leak success.

## Stop rule
- Do not continue blind remote mutation after two flat attempts without a new observation or a stronger local/runtime model.

## Reuse query terms
- remote drift
- local works remote fails
- prompt sync
- libc mismatch
- timeout not shell
