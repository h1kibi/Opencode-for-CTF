# PWN Failure Signature

Use this after a failed or partially failed PWN attempt. Keep it short and reusable; do not store flags, live credentials, private tokens, or one-off secrets.

## challenge_context
- challenge name / slug:
- difficulty guess: simple | medium | hard
- binary / runtime:
- final status: solved | unsolved | partial | abandoned

## failure_signature
- missed first signal:
- wrong family selected:
- wasted same-family attempts:
- blocker type: route | primitive | leak | heap | runtime | remote drift | closure | tooling
- exact failure symptom:

## correct_or_better_route
- likely correct route:
- earliest evidence that should have triggered it:
- required primitive ladder stage:
- shortest closure path:

## fast_mode_patch
- should `ctf-pwn-fast` have solved this? yes | no | maybe
- new fast rule:
- new handoff trigger:
- template to improve:
- one cheap probe that would have saved time:

## rigorous_mode_patch
- new rigorous rule:
- new gate or falsify condition:
- needed ledger field:
- tool that should have been used earlier:

## template_patch
- affected file:
- missing helper / parameter / receive logic:
- local/remote support issue:
- proposed minimal edit:

## pattern_card_seed
- family:
- first signal:
- required evidence:
- false positive:
- query terms:

## replay_notes
- minimal reproduction command:
- last-known-good exploit artifact:
- transcript/log path:
- safe benchmark candidate? yes | no + reason:
