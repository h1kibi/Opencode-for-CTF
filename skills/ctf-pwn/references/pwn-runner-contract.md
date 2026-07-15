# Pwn Runner Contract

Use this for final exploit verification and for distinguishing success from a script that merely ran.

## Success Signals

Final exploit verification must report:

```json
{
  "local_success": true,
  "remote_success": "untested",
  "flag_detected": false,
  "flag_value": "",
  "shell_detected": false,
  "crash": false,
  "timeout": false,
  "exploit_file": "exploit.py",
  "notes": ""
}
```

Rules:

- `script_ran_ok` is not success.
- A shell prompt is not enough; run a harmless command or read the flag when in CTF scope.
- SIGSEGV after payload is failure unless the flag was already verified.
- Timeout is not proof of shell; confirm with an interactive oracle or deterministic command.
- If remote is unavailable, set `remote_success` to `untested` and explain the local proof.

## Last Attempt Handling

For non-trivial pwn attempts:

- Keep the current iterative script as `work/last_attempt.py`.
- Promote to `exploit.py` or `solve.py` only after the current primitive or final path is verified.
- Write only verified final flags to `agent_flag.txt`.

## Failure Classification

Classify failed runs before changing payload logic:

| Symptom | First Recheck |
|---|---|
| SIGSEGV before return | protocol/input length/state |
| SIGSEGV at `ret`/gadget | offset/control/base/alignment |
| SIGSEGV in libc `movaps` | add alignment `ret` or recheck stack alignment |
| EOF before payload effect | prompt sync, buffering, remote crash, timeout |
| Local works remote fails | libc/ld, ASLR, forking, timeout, newline/null, prompt sync |
| Shell appears but no command works | shell route consumed by earlier read, seccomp, PTY/buffering |

Stop after three same-family changes without a new observation.
