---
description: Run gdre_tools through a stable local wrapper for Godot list/extract/recover/decompile tasks
agent: ctf-rev
subtask: false
---

Run the local `gdsdecomp` / `gdre_tools` wrapper.

Target/context:
$ARGUMENTS

Use this when you need one of:

- list files from a Godot `.pck` / `.exe` / `.apk`
- extract a pack
- recover a full project
- decompile a `.gdc`
- inspect available bytecode versions

Return:

```text
CTF_GODOT_DECOMPILE:
- target:
- mode:
- gdre_path:
- output_dir:
- log:
- next_probe:
- output_preview:
```

Rule: prefer `ctf-godot-pack-inspect` first when you only need to shrink scope; use this wrapper when you are ready to invoke the real GDRE toolchain.
