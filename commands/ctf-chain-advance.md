---
description: "CTF helper: One-shot observe + infer state + suggest next action (reduces agent cognitive load)"
agent: ctf-master
subtask: false
---

Run the CTF chain advance helper. This combines observe + state inference + next-action suggestion into one call.

Arguments:
$ARGUMENTS

## Usage

### Observe a segment probe and get next action:

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_advance.py observe <chain_id> <segment_id> "<probe>" "<result>" --differential "<diff>" --blocker "<blocker>"
```

### Observe a branch probe and get next action:

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_advance.py observe-branch <chain_id> <branch_id> "<probe>" "<result>" --differential "<diff>"
```

### Get next action suggestion without probing:

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_advance.py next-action <chain_id>
```

## Rules

- This command replaces separate `observe` + `report` + manual next-action reasoning.
- After running, follow the suggested next action unless strong evidence contradicts it.
- If suggested action is TRY_BYPASS_OR_BACKTRACK, run `/ctf-waf-bypass-plan` before trying payloads.
- If suggested action is PIVOT_FAMILY, the current payload family is exhausted - try a different technique family.
- If suggested action is ABANDON_CHAIN, mark the chain DEAD and switch to the next top-ranked chain.
