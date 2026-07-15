---
description: CTF domain: OMO-style CTF tool capability router; map concrete evidence to the best CTF tool and forbidden wrong tools
agent: ctf-master
subtask: false
---

Map evidence to the best CTF tool.

Evidence:
$ARGUMENTS

Rules:
- Choose tools by concrete evidence, not challenge title.
- Prefer one high-information specialized tool over multiple manual shell commands.
- Include forbidden or premature tools to prevent drift.
- If several tools fit, rank by information gain, cost, state damage, and stability.
- Do not execute tools in this command; produce a routing decision.

Return compactly:
1. Evidence tokens that matter.
2. Best next tool and exact target/input.
3. Runner-up tools and why they are lower priority.
4. Forbidden premature tools/actions.
5. Expected output shape and how to classify it.
6. Next gate after the tool: validate-probe / review / pivot / final / state-update.
