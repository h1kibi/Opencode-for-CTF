---
description: CTF control: OMO-style CTF pivot gate; stop low-information same-family attempts and choose one orthogonal probe
agent: ctf-expert
subtask: false
---

Run the CTF Pivot Gate.

Blocked branch context:
$ARGUMENTS

Rules:
- Use this after two same-family probes without a new differential, one tool path failing twice, or a hypothesis becoming low information.
- Do not add another payload variant in the same family unless a new oracle or new evidence changes the test.
- Mark the blocked family, parameter, tool path, and reason.
- Choose one orthogonal high-information test that can confirm/falsify/distinguish a different hypothesis.
- Prefer changing family, oracle, parser boundary, auth/state boundary, or source/sink evidence source over changing only payload spelling.
- If no orthogonal test is available, return NEED_INFO rather than continuing variants.

Return compactly:
1. Blocked family/path and evidence.
2. Why continuing is low information.
3. Remaining top hypotheses.
4. Exactly one orthogonal next probe with confirm/falsify/distinguish outcomes.
5. PIVOT or NEED_INFO.
