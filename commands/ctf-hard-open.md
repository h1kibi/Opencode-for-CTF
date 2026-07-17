---
description: CTF hard-open: Build a rigorous opening pack for difficult, complex, multi-artifact, or ambiguous CTF challenges before probing
agent: ctf-expert
subtask: false
---

Run the hard opening protocol for a difficult or complex authorized CTF challenge.

Challenge context:
$ARGUMENTS

Purpose:
- Prevent premature category lock-in, payload drift, and repeated manual triage.
- Convert messy challenge inputs into one owner, at most one support surface, top-3 hypotheses, and exactly one next safe probe.
- Use this before deep exploitation when the challenge has source, archives, bytecode, Docker/config, multiple services, many artifacts, stateful workflows, unclear category, or competing plausible branches.

Hard Opening Pack:
1. Target inventory:
   - URL/service/artifact paths
   - local workspace path if any
   - archive/source/binary/pcap/media/API/bytecode indicators
   - known flag format and challenge hints
2. Scope and safety:
   - authorized CTF/lab/local target only
   - state-changing budget
   - fuzz/OOB/upload/write/race budget if relevant
   - destructive or broad actions to avoid first
3. Route model:
   - category confidence
   - primary owner candidate
   - at most one support surface
   - source/runtime availability
   - first safe mapper/probe
4. Direct-win check:
   - cheapest narrow check for direct flag/source/config/secret/admin/debug exposure
   - must be low-noise and have a clean success/failure oracle
5. Competition budget and stuck gate:
   - choose `speedrun`, `medium`, `hard`, `safe-remote`, or `local-only`
   - set same-family probe cap, fuzz/bot/upload/write/race/OOB cap, state-changing request cap, remote exploit attempt cap, and time/checkpoint budget
   - define stuck trigger: two failed top hypotheses, 2-3 no-progress probes, repeated tool failure, state-damage risk, or about 25% budget spent without closure movement
6. Evidence collection plan:
   - Prefer initializing `work/ctf-evidence/<challenge-slug>/` early when the challenge slug is stable.
   - Refresh `route.json`, `inventory.md`, and `hypotheses.json` as the canonical opening packet before deep probing.
   - if local artifact/directory exists, prefer exactly one `ctf-one-shot-triage` first
   - route archive to `ctf-safe-extract`, API specs/lists to `ctf-api-map`, Java/JAR/WAR/class to `ctf-java-*`, binary to `ctf-binary-probe`, pcap to `ctf-pcap-probe`, media/doc to `ctf-stego-probe`, RSA-like input to `ctf-rsa-probe`, Web source to `ctf-web-source-map`, URL-only Web to `ctf-web-fingerprint` then `ctf-web-blackbox-map mode=light`
7. Fanout decision:
   - Fanout YES only if category is ambiguous, artifact set is broad, source and runtime disagree, or two owners have plausible flag paths.
   - Use `ctf-scout` for route/tool selection, `ctf-librarian` for evidence-keyed pattern recall, and `ctf-oracle` for hypothesis sanity.
   - Subagents must not exploit, fuzz broadly, mutate state heavily, or pursue final chains independently.
8. Hypothesis queue:
   - top-3 only
   - each hypothesis must include controlled input or artifact, sink/oracle, positive evidence, negative evidence, next one-variable probe, expected useful differential, kill/pivot rule, owner, support surface if any, and plausible flag path
9. Controller state:
    - for non-trivial branches, initialize or update `ctf-decision-state` with non-empty `modelJson` and `hypothesesJson`
    - if source exists, plan a `source_first` gate before blind black-box probing
    - if a primitive is already known, skip hard opening and enter closure mode instead
10. Disk evidence expectation:
   - preferred structured packet: `inventory.md` + `route.json` + `hypotheses.json`
   - preferred markdown packet: `resume.md` / `handoff.md` only as compact restart supplements, not replacements for structured state
   - after owner/queue selection stabilizes, refresh the evidence packet with `ctf:evidence-doctor <challenge-slug>`

Return format:
1. HARD_OPEN: YES / NO and reason
2. Inventory summary
3. Primary owner and support surface
4. First safe mapper/probe
5. Direct-win check
6. Budget profile and stuck-gate trigger
7. Fanout decision and scoped subagent tasks, if any
8. Top-3 hypotheses with next probe and kill rule
9. Decision-state init/rank payload summary, if needed
10. Exactly one next action

Rules:
- Do not exploit inside this command unless the direct-win check is a single narrow low-noise action with a clean oracle.
- Do not run wordlist fuzzing, sqlmap, repeated upload/bot/race triggers, or broad enumeration from hard-open.
- If a confirmed primitive already exists, stop and recommend `/ctf-closure` instead.
- If the challenge is simple and one-hop, stop and recommend direct solve or `/ctf-fast`.
