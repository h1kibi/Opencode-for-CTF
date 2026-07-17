---
description: PWN fast opener: artifact map, binary probe, route guess, and exploit template selection
agent: ctf-expert
subtask: false
---

Open a simple/medium PWN challenge in fast mode.

Context:
$ARGUMENTS

Rules:
- Spend at most one short opener round before creating or selecting `exploit.py`.
- Do not become rigorous. If the target is not clearly fast-lane PWN, hand off.
- Prefer existing challenge Docker if it is obvious and cheap; otherwise prefer prebuilt pwnlab runbox over copying compose templates.
- If route is plausible, copy the matching fast template to `exploit.py` before more prose.

Required actions:
1. Run `ctf-pwn-fast-bootstrap` on the challenge directory.
2. If bootstrap found a likely route, run `ctf-pwn-template-init` with its route/binary/libc recommendation.
3. Run the binary once if safe to learn stdin/argv/menu/prompt.
4. Use `ctf-binary-probe` only if bootstrap evidence is insufficient.
5. State the next one concrete command/probe.

Output contract, max 18 lines:
```text
PWN_FAST_OPEN
binary:
libc/ld:
checksec:
input_model:
route:
template:
exploit_path:
substrate: host | challenge-docker | pwnlab-runbox | compose-lab | handoff
next_probe:
handoff_now: yes/no + reason
```
