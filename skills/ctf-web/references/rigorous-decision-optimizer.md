# Rigorous Web Decision Optimizer

Use this reference when a Web CTF has source/bytecode, a confirmed primitive with blockers, multiple plausible branches, or when the solver starts doing repeated path/payload variants. Its goal is to select the shortest evidence-backed path to the flag, not the most familiar primitive.

## Core Rule

A confirmed primitive does not automatically remain top-1. The top branch is the chain with the best combination of challenge-specific evidence, clean oracle, short distance to flag, light blockers, and an executable first safe probe.

## Top-3 Hypothesis Checklist

Keep at most three branches. Each branch must state:

- `controlled_input`: what the attacker controls
- `sink_or_oracle`: where the input is consumed or observed
- `challenge_specificity`: author-written clue, library, custom branch, route name, error, or source line
- `exploit_family`: LFI, XXE, SSRF, deserialization, template, upload-write, authz, parser differential, etc.
- `first_safe_probe`: one minimal probe that confirms/falsifies/distinguishes the branch
- `distance_to_flag`: direct / short / medium / long
- `blocker`: filter, blind oracle, no output channel, auth boundary, missing route, upload non-exec, no OOB infra, etc.
- `downgrade_trigger`: exact condition that moves the branch to fallback

Reject or demote branches that cannot name a first safe probe.

## Scoring Template

Score each 1-5 and prefer the highest total:

| Factor | 1 | 3 | 5 |
|---|---|---|---|
| Challenge specificity | generic guess | weak route/error clue | explicit source/library/custom branch |
| Oracle quality | timeout/404/generic error | structural diff/error | direct readback/OOB/writeback/privileged diff |
| Distance to flag | long | medium | direct/short |
| Blocker weight | heavy | manageable | light |
| First probe quality | noisy/ambiguous | usable | one-shot discriminator |

`total = specificity + oracle + distance + blocker + first_probe`.

## Mandatory Sink Escalation Gate

When source/bytecode reveals a library-specific or parser-specific sink, immediately convert it to an executable hypothesis before more generic probing.

Examples:

| Evidence | Exploit family | First safe probe |
|---|---|---|
| `WorkbookFactory.create(InputStream)`, POI, XMLBeans, xlsx/docx | OOXML XXE / external entity / OOB | upload `excel-*.xlsx` with unique OOB DTD canary |
| XML parser / SAXBuilder / DocumentBuilder | XXE | harmless external entity/DNS canary |
| `ObjectInputStream.readObject` | Java deserialization | local gadget/classpath gate, then canary gadget if reachable |
| Fastjson/Jackson/XStream/SnakeYAML | parser/gadget class | version/config/data-shape gate, then one canary |
| template render on user content | SSTI/template injection | arithmetic/string marker with safe context |
| server-side URL fetch | SSRF | DNS/HTTP canary or internal safe path check |
| archive extraction | ZipSlip / file write | harmless nested-path canary, no overwrite |

If this gate fires, the branch must enter top-2 unless it has no controlled input or no oracle.

## Confirmed Primitive Downgrade Rule

Downgrade a confirmed primitive from top-1 when any two are true:

- Two same-family closure probes produce no new differential.
- Closure is reduced to path guessing, encoding variants, or alias hunting.
- A hard blocker is source-confirmed, e.g. keyword filter, auth gate, non-executable upload directory.
- A source-guided, library-specific, or challenge-specific sink appears with a cleaner first probe.
- The primitive cannot state a plausible flag path within the current privilege/output boundary.

Downgrade means keep as fallback, not abandon forever.

## Challenge-Specificity Override

Author-written unusual logic outranks generic habits. Promote branches containing:

- special filename prefixes or suffix gates (`excel-*.xlsx`, `avatar.svg`, `backup.zip`)
- custom parser/transform/merge code
- explicit library calls
- weird comments, debug strings, or hand-written error messages
- route names that imply an intended workflow
- source branches that exist only for one file type or one parameter

Do not spend more than two generic probes while such a branch has not received its first safe probe.

## Drift / Stop Signals

Stop and rerank if you notice:

- repeated `/flag`, `/flag.txt`, log, webroot, proc, fd, or env path guessing
- multiple payloads that only change syntax but not hypothesis
- long reasoning without a probe while a first safe probe exists
- continuing a confirmed primitive only because it is already confirmed
- treating a library name as background instead of an exploit router

## Closure Owner Rule

Closure owner is the branch most likely to reach the flag with the shortest stable chain. It is not necessarily the first confirmed primitive.

Example decision pattern:

- LFI confirmed but blocked by `contains("flag")`, no alias, no direct flag path -> fallback.
- Upload parser branch has `excel-*.xlsx` + POI `WorkbookFactory.create` + OOB canary probe -> promote to closure candidate.

## One-Minute Rerank Procedure

When stuck or after a new source sink:

1. Write the current top-3 in one line each.
2. Score with the five-factor template.
3. Identify any source-guided sink without first safe probe.
4. Execute the highest-scoring first safe probe.
5. If two same-family probes are flat, downgrade and pivot.
