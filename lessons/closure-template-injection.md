# closure-template-injection

## Trigger
- Template expression execution, arithmetic fingerprint, render-time object access, or SSTI-equivalent behavior is confirmed.

## Why it looks promising
- Template control often leads quickly to file read, config read, environment access, internal object access, or code execution.

## What usually goes wrong
- The solver spends time escalating payload cleverness instead of extracting the cheapest high-value assets.

## Better question
- What is the smallest template-side read path that reaches config, source, env, filesystem, or privileged state?

## First corrective probe
- Build a tiny queue for config/env/source/object traversal before shell obsession.

## Closure queue
1. direct flag/config/secret read
2. app source/template path read
3. privileged object/session access
4. code execution only if read paths are blocked
5. one stable minimal payload for replay

## Stop rule
- Read beats shell when a direct flag/config/source path exists.
