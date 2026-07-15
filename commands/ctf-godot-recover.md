---
description: Recover a Godot project using the local gdre_tools wrapper
agent: ctf-rev
subtask: false
---

Recover a Godot project from `.pck`, `.exe`, `.apk`, or extracted project directory.

Target/context:
$ARGUMENTS

Use `ctf-godot-decompile` with `mode=recover` when:

- you need full project recovery rather than just file listing
- unpacked resources, decompiled scripts, and restored project layout will shorten the solve
- the target is a packed Godot release and broad manual carving is slower than GDRE recovery

Return should prioritize:

- output directory
- recovery log
- next hottest scripts/scenes/resources to inspect

Rule: if you only need to know whether the project contains hot `.gdc` / `.tscn` targets, use `ctf-godot-open` or `ctf-godot-pack-inspect` first.
