---
description: CTF closure: Force primitive-to-flag closure with flag-location modeling and closure-probe ranking
agent: ctf-master
subtask: false
---

Run the CTF Closure Gate.

Current primitive / branch state:
$ARGUMENTS

Rules:
- Use only after a high-value primitive is confirmed, or when a plausible primitive-to-flag path exists.
- This command is a thin closure entrypoint. Follow `ctf-master` as the source of truth for direct-win fast-path, closure override, and low-noise endgame behavior.
- If the branch is not yet in a true endgame state, return that it is not ready rather than forcing closure ceremony.
- Before ranking closure probes, compress the branch into a closure normal form when applicable: `control`, `code_addr`, `writable_memory`, `replay`, `leak_surface`, `closure_template`.
- Ask whether a 20-40 line minimum solve sketch is already possible. If yes, treat the branch as true closure mode and demote extra explanation that does not shorten the path.
- For PWN closure, prefer canonical templates in this order unless falsified: `ret2win` -> `pivot to writable static/global memory` -> `single leak + replay` -> `ORW` -> `shell`.
- Distinguish bridge primitives from closure primitives. A branch may keep a bridge primitive in the queue only if it is required by the currently selected canonical closure template.
- Before ranking closure probes, prefer the strongest existing artifact under `work/ctf-evidence/<challenge-slug>/`: `ctf_resume_packet.md` style -> `ctf_fast_handoff.md` style -> `ctf_handoff.md` style -> `ctf_evidence_snapshot.md` style.
- Preferred entrypoint note: use `/ctf-close` when the branch is already in active low-noise endgame execution, and `/ctf-final` when a credible candidate flag already exists. Use `/ctf-closure` specifically for flag-location modeling and closure-probe ranking.
- Default disk targets: `work/ctf-evidence/<challenge-slug>/closure.json` for ranked closure state and `final-verification.txt` only when the path becomes replayable.
- Prefer `write-evidence-state closure <challenge-slug> ...` or the dedicated closure writer when refreshing structured endgame state.

Return style:
- Compact and operational.
- Return the current primitive, best flag-location hypothesis, top closure probe, and the next re-rank decision.
- Also return:
  0. closure normal form
  1. primitive family
  2. closure owner
  3. main blocker
  4. second-best closure probe
  5. stop rule for this closure family

Primitive-specific closure discipline:
- If the primitive is source leak, file read, admin/session, SSRF/internal read, DB read, file write, or checker recovery, prefer the closure queue for that primitive family over unrelated discovery.
- If closure is not actually ready, say so explicitly and name the exact missing prerequisite.
- When a primitive family is recognized, explicitly consult the matching lesson family before ranking closure probes. Preferred mapping:
  - source leak -> `lessons/closure-source-leak.md`
  - file read -> `lessons/closure-file-read.md`
  - admin/session -> `lessons/closure-admin-session.md`
  - SSRF/internal -> `lessons/closure-ssrf-internal.md`
  - DB read -> `lessons/closure-db-read.md`
  - file write -> `lessons/closure-file-write.md`
  - deserialization -> `lessons/closure-deserialization.md`
  - template injection -> `lessons/closure-template-injection.md`
  - JWT/auth token forge -> `lessons/closure-jwt-role-forge.md`
  - Java actuator / Spring privileged read -> `lessons/closure-java-actuator.md`
  - rev checker recovery -> `lessons/closure-rev-checker-recovery.md`
  - crypto oracle / partial cryptanalytic win -> `lessons/closure-crypto-oracle-to-plaintext.md`
  - pwn leak/control without flag yet -> `lessons/closure-pwn-leak-to-win.md`

Closure-first state discipline:
- Once a high-value primitive is confirmed, treat the branch as being in `closure-first` state unless a named blocker proves further discovery is mandatory.
- In `closure-first` state, unrelated discovery branches are lower priority than blocker resolution or direct closure probes.
- If a matching closure lesson provides a closure owner hint, use it explicitly in the closure summary.
- If the branch already has fixed code address + writable static/global memory + control-transfer primitive + leak path/direct close path + replay/persistence, default to closure-only behavior and reject new exploit-family expansion unless the current canonical family is concretely falsified.
