---
description: Inspect a Windows GUI process and preview visible controls without patching or injecting
agent: ctf-rev
subtask: false
---

Inspect a Windows GUI challenge process through low-risk UIAutomation.

Target/context:
$ARGUMENTS

Use this when:

- the challenge is a Windows GUI app
- you can launch the process but need faster visibility into window text/buttons/controls
- you want process/title + visible control preview before deeper runtime work

Return:

```text
CTF_WINDOWS_GUI_INSPECT:
- windows:
- process:
- control previews:
```

Rule: use this for observability only. It does not click, patch, inject, or mutate GUI state.
