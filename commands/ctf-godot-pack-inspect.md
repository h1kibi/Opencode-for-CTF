---
description: Inspect an unpacked Godot project or .pck tree and surface the hottest .gdc/.gd/scene targets
agent: ctf-rev
subtask: false
---

Inspect a Godot unpack root, script tree, or `.pck`-adjacent directory.

Target/context:
$ARGUMENTS

Use this when:

- a Godot game is already unpacked
- you have `.gdc`, `.gd`, `.tscn`, `.tres`, or `.import` artifacts
- you need the shortest next script/scene/resource focus before deeper tooling

Return:

```text
CTF_GODOT_PACK_INSPECT:
- target:
- file_count_inspected:
- gdc_count:
- gd_count:
- scene_count:
- resource_count:
- import_meta_count:
- top_targets:
- high_signal_strings:
- next_steps:
```

Rule: use this to shrink scope first; do not wait on a full `.gdc` decompiler before identifying the hottest script and scene files.
