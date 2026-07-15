---
description: Open a Godot challenge with fast scope shrinking before full recovery/decompile
agent: ctf-rev
subtask: false
---

Open a Godot challenge through the shortest shrink-first route.

Target/context:
$ARGUMENTS

Opening order:

1. Run `ctf-godot-pack-inspect` first on the unpacked directory, script tree, or recovered output.
2. If the target is still packed (`.pck` / `.exe` / `.apk`), use `ctf-godot-decompile` with:
   - `mode=list-files` to inventory packed contents
   - `mode=extract` to unpack
   - `mode=recover` when full project recovery is justified
3. If the hottest files are `.gdc`, use `ctf-godot-decompile mode=decompile` with an explicit `forceBytecodeVersion`.
4. If images/resources become important, pivot into `ctf-media-open` or `ctf-image-open`.

Rule: prefer scope shrinking before full recovery. Do not wait on broad runtime/GUI work if the hottest `.gdc` / scene / resource files are already visible.
