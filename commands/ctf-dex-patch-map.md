---
description: Map DEX patch offsets to class and method code_item owners
agent: ctf-rev
subtask: false
---

Map extract.dat-style DEX patch records back to method owners.

Target/context:
$ARGUMENTS

Use `ctf-dex-patch-map` when evidence suggests `(offset,size,old,new)` patches against `classes.dex`, code_item hot patches, native shell patching, or classloader/runtime repair.

Inputs:
- `target`: APK/JAR/ZIP or `classes.dex`
- optional `dexEntry`: choose `classes2.dex` etc. for multi-dex APKs
- `patchFile` or inline `patches`: JSON/text records containing offset and size; `old`/`new` hex are supported when available
- optional `patchFormat`: `auto`, `json`, `text`, `u32le_pairs`, or `extract_dat_u32le_pairs`

Return:

```text
DEX_PATCH_MAP:
- container:
- dex:
- method_code_items:
- patches_seen:
- mapped_patches:
- patch_code_unit_views:
- high_signal_methods:
```

Rule: after owner resolution, use the byte/code-unit diff to prioritize hit methods, then inspect patch-writer xrefs before broad JADX/apktool browsing.
