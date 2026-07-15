---
description: Check local Godot reverse-engineering tool readiness
agent: ctf-rev
subtask: false
---

Check local Godot reverse-engineering environment readiness.

Context:
$ARGUMENTS

Run:

```text
node scripts/doctor-godot-rev.ts
```

Return should summarize:

- whether `gdre_tools.exe` is present
- whether version/help/bytecode listing work
- whether fast Godot `.gdc` / `.pck` recovery is ready
