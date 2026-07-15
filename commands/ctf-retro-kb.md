---
description: CTF post: Auto-extract solved challenge learnings into SecKB (chain branches, bypass techniques, signals)
agent: ctf-master
subtask: false
---

Run the automatic solve→retro→KB feedback loop after a challenge is solved or timed out.

Context:
$ARGUMENTS

This command extracts reusable knowledge from the current challenge's `.ctf-chain-state.json` and feeds it back into the local SecKB:
- Confirmed chain segments and their signals
- Successful bypass techniques (blocker → method)
- Probe efficiency analysis
- Retro note for future reference

## Steps

1. Run retro extraction:

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_retro_to_kb.py --state .ctf-chain-state.json --challenge-name "$ARGUMENTS"
```

2. If the retro identifies new bypass techniques, verify they are recorded in `chain_branches.json`.

3. The index is automatically rebuilt after extraction.

## Rules

- Do not continue exploiting or exploring after running retro.
- The retro note should be concise and reusable, not a challenge-specific writeup.
- If the challenge was not solved, still run retro to capture blocker/bypass learnings.
- Do not store raw flags or secrets in the KB (the script auto-redacts them).
