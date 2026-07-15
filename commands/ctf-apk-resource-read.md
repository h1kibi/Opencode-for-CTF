---
description: Read APK resources by id or name without broad decompilation
agent: ctf-rev
subtask: false
---

Read APK resources directly from packaged resource tables.

Target/context:
$ARGUMENTS

Use `ctf-apk-resource-read` when you have:

- a resource id such as `0x7f...`
- a resource name such as `app_name`, `main_title`, `flag_hint`
- a need to inspect packaged strings/layout references without broad JADX/apktool browsing

Return:

```text
APK_RESOURCE_READ:
- apk:
- query:
- tools:
- line_count:
- matches:
```

Rule: use this as a fast packaged-resource lookup first; switch to broader Java/resource reversing only if the returned value lines are insufficient.
