# Switch-agent workflow

This config is set up for three primary work agents:

- `daily` — default normal development mode
- `ctf-master` — authorized CTF/lab/challenge solving control mode
- `researcher` — local SecKB/CVEKB maintenance mode

The built-in `build` and `plan` primary agents are disabled in `opencode.jsonc`, so the configured agent-cycle shortcut toggles cleanly among the primary work agents.

## Shortcuts

Defined in `tui.json`:

- `Tab` or `Ctrl+X` then `j`: cycle to the next primary agent
- `Shift+Tab` or `Ctrl+X` then `k`: cycle to the previous primary agent
- `Ctrl+X` then `a`: open the agent list

With only the intended work agents enabled as primary agents, agent cycling stays focused on daily work, CTF control, and KB maintenance.

## Recommended use

1. Start normally in `daily` mode.
2. When you want to solve a CTF challenge, switch to `ctf-master`.
3. Send the challenge info directly, or run `/ctf <challenge info>` to initialize the structured CTF workflow.
4. When you want to maintain the local knowledge base, switch to `researcher`.
5. Return to `daily` when you leave CTF or KB work.

`/ctf` is an initializer for CTF control mode, not a detached route-only subtask.
