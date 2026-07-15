---
description: CTF PWN: Map overlap notes into field offsets and likely consumers
agent: ctf-pwn
subtask: true
---

Use `ctf-pwn-heap-overlap-mapper` when heap overlap is known or strongly suspected and you need to reduce `chunkA user offset -> chunkB field` relationships before more payload mutation.

Context:
$ARGUMENTS

Workflow:
1. Provide overlap notes, gdb snippets, or decompilation clues.
2. Generate offset/field pairs and keyword hints.
3. Use the strongest pair to drive exactly one overwrite/read proof.

Output contract:
```text
PWN_HEAP_OVERLAP_MAP
pairs:
keywords:
best_next_pair:
recommended_next_probe:
```
