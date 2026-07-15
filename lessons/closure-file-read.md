# closure-file-read

## Trigger
- Arbitrary or constrained file read/LFI/local-read primitive is confirmed.

## Why it looks promising
- File read is already a high-value primitive and often enough to reach the flag, source, config, secrets, or deployment metadata.

## What usually goes wrong
- The solver treats file read as a generic exploration toy and dumps broad filesystem targets.
- The solver keeps chasing RCE while a direct read path probably exists.

## Better question
- What are the cheapest highest-probability files for this runtime, user, and working directory?

## First corrective probe
- Record current base path and test a tiny ranked file set: `/flag*`, app root flags, config/env files, service-specific privileged files, then only the most likely source path.

## Closure queue
1. direct flag paths
2. app config / `.env` / deployment manifests
3. source or templates that reveal a privileged route
4. process/env metadata only if it narrows flag location
5. one runtime-path confirmation

## Stop rule
- After two no-differential low-probability path guesses, stop broad path mutation and return to source-guided or deployment-guided targeting.

## Reuse query terms
- file read lfi flag path env config app root deployment read helper
