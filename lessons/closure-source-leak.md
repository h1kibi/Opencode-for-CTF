# closure-source-leak

## Trigger
- Source code, config, templates, scripts, Dockerfile, build artifacts, or decompiled logic are readable.

## Why it looks promising
- Source often collapses uncertainty across routes, validators, sinks, role checks, path resolution, and flag location.

## What usually goes wrong
- The solver keeps black-box fuzzing after source is already enough to model the sink or closure path.
- The solver reads source broadly but does not immediately slice toward flag, secret, admin, env, read helper, or privileged route.

## Better question
- Given this source, what is the shortest path from current control to flag/source/config/secret/admin-only state?

## First corrective probe
- Build a backward slice from `flag`, `secret`, `token`, `admin`, `readflag`, env/config loaders, and privileged routes to the nearest attacker-controlled source.

## Closure queue
1. direct flag/config/secret path
2. privileged route or role check path
3. helper binary / internal service / env-backed path
4. parser mismatch or sink adapter path already visible in source
5. one cheap runtime confirmation of the best branch

## Stop rule
- Do not return to broad route discovery until the top two source-guided closure probes fail or are falsified.

## Reuse query terms
- source backward slice flag config secret admin route env helper sink
