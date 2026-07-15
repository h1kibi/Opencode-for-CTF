# CTF Real-World Validation Checklist

Use this checklist after the current CTF Agent OS upgrades when validating the system against real challenges.

The goal is not just to see whether a flag is solved. The goal is to see whether the upgraded controller, evidence, handoff, and resume behavior work smoothly under real pressure.

## How To Use This Checklist

- Pick a real authorized local challenge, archived challenge bundle, benchmark fixture, or competition replay.
- Run one challenge at a time.
- Keep the evidence directory for each run.
- Score both solve outcome and system behavior.

Suggested evidence root:

- `work/ctf-evidence/<challenge-slug>/`

Suggested QA root:

- `work/config-qa/<date>-<slug>/`

## Validation Matrix

Run at least one challenge in each family.

### Fast Lane

- one easy Web direct-win or source-leak challenge
- one easy Misc decode/transform challenge
- one easy Crypto one-shot challenge

### PWN Fast

- one simple ret2win or direct BOF
- one format-string leak-first case
- one seccomp or ORW-flavored simple case

### Rigorous Controller

- one source-rich Web or Java challenge
- one mixed-surface owner-switch challenge
- one closure-heavy challenge where primitive is known but flag path is not
- one interruption/resume test

## Checklist A: Entry Routing

Question: Did the right entry mode get chosen?

- `ctf-fast` stayed fast and did not imitate `ctf-master` on a truly simple case.
- `ctf-fast` locked onto a single simple PWN route and did not widen prematurely.
- `ctf-master` took over when the challenge became branchy, source-rich, stateful, or mixed-surface.
- `ctf-fast` escalated with a structured handoff instead of freeform explanation.

Pass if:

- the chosen mode matches challenge complexity
- escalation happens before wasted same-family drift accumulates

## Checklist B: Evidence Bootstrap

Question: Did the run initialize and use canonical evidence correctly?

- `work/ctf-evidence/<slug>/` exists.
- `route.json` exists.
- `primitive.json` exists once a primitive is confirmed.
- `closure.json` exists once closure reasoning begins.
- at least one of `resume.md`, `handoff.md`, or `fast-handoff.md` exists for non-trivial runs.

Pass if:

- the challenge can be restarted from disk without relying on chat history alone

## Checklist C: Resume Behavior

Question: Does restart use the right artifact priority?

Test:

1. Stop after meaningful progress.
2. Start a fresh session.
3. Use the resume path.

Validate:

- the system prefers `resume.md` if present
- otherwise prefers `fast-handoff.md`
- otherwise `handoff.md`
- otherwise `snapshot.md`
- only then falls back to JSON state and notes

Pass if:

- the resumed next probe matches the pre-interruption branch state
- no broad recon restart occurs unless evidence is genuinely missing

## Checklist D: Primitive Lock and Closure

Question: After a high-value primitive is confirmed, does the system actually enter closure-first behavior?

Validate:

- unrelated discovery branches are downgraded
- `closure.json` is refreshed
- the closure owner is explicit
- the next closure probe is concrete and one-variable
- two flat closure probes cause downgrade or rerank, not endless repetition

Pass if:

- primitive-to-flag distance clearly shrinks after primitive confirmation

## Checklist E: PWN Runtime Discipline

Question: Does PWN avoid substrate drift and retain calibration discipline?

Validate:

- substrate is chosen early
- challenge Docker or pwnlab Docker is preferred when appropriate
- no bouncing between Docker, WSL, and PowerShell for the same probe family
- after control is confirmed, calibration happens before exploit roulette
- `pwn_state_compact.md` or equivalent compact state exists for non-trivial PWN

Pass if:

- remote/local divergence is handled through drift checks instead of random gadget mutation

## Checklist F: Command Contract Integrity

Question: Do controller commands still advertise the right state contracts?

Run:

```powershell
node scripts/check-command-helper-contracts.ts
```

Pass if:

- all contract checks pass

## Checklist G: Real-World Solve Quality

Question: Did the system produce a good solve, not just a lucky flag?

Validate:

- solve path is reproducible
- handoff and resume artifacts are understandable
- final verification explains the shortest path clearly
- no hidden dependency on fragile chat-only memory

Pass if:

- another session could continue or reproduce the solve from evidence artifacts and solver files

## Checklist H: Failure Quality

Question: If the challenge is not solved, is the failure still high quality?

Validate:

- strongest evidence is preserved
- blocked branches are explicit
- same-family attempts are counted
- next best probe is concrete
- a rigorous follow-up could restart from artifact state

Pass if:

- failure still leaves a strong restart package instead of vague notes

## Suggested Test Runs

Use at least these practical scenarios.

### Scenario 1: Fast-to-Rigorous Escalation

- Start in `ctf-fast`
- Reach a non-trivial branch
- Escalate to `ctf-master`
- Verify `fast-handoff.md` quality

### Scenario 2: Mid-Branch Interruption

- Start in `ctf-master`
- Confirm one primitive or strong signal
- Stop intentionally
- Resume in a fresh session
- Verify resume target and next probe quality

### Scenario 3: PWN Runtime Drift

- Run a simple or medium PWN challenge with Docker relevance
- Check whether substrate lock stays stable
- Check whether control leads to calibration rather than route reopening

### Scenario 4: Closure-Heavy Endgame

- Use a challenge where source, file-read, admin/session, SSRF, or checker recovery gives a primitive before the flag
- Verify transition from discovery to closure-first behavior

## Record Template

For each real-world validation run, record:

- challenge:
- category:
- entry mode used:
- solve outcome: solved / escalated / failed / resumed
- evidence bootstrap quality: good / partial / weak
- resume quality: good / partial / weak
- closure discipline: good / partial / weak
- pwn runtime discipline: good / partial / weak / not_applicable
- final verification quality: good / partial / weak / not_applicable
- biggest friction point:
- recommended next system patch:

## Exit Criteria

The current system can be considered real-world stable when all of the following are true across multiple challenge families:

- fast modes escalate early enough and with structured handoff
- `ctf-master` resumes without broad recon restarts
- closure-first behavior appears reliably after primitive confirmation
- PWN branches keep substrate lock and calibration discipline
- final verification artifacts are preserved and readable
- the QA suite remains green after small configuration changes

At that point, future work should shift from architecture changes to targeted friction reduction based on actual challenge runs.
