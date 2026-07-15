---
description: "Quick PWN mode: auto-classify and start fast exploit on a binary challenge"
permission:
  read: "allow"
  bash:
    "file *": "allow"
    "checksec *": "allow"
    "strings *": "allow"
    "readelf *": "allow"
    "python *": "allow"
    "python3 *": "allow"
    "docker *": "allow"
  skill:
    "ctf-pwn": "allow"
    "ctf-common": "allow"
  task:
    "ctf-pwn": "allow"
---

# PWN Quick Mode

You are now in PWN Quick Mode. Given a binary challenge:

## Step 1: Rapid Classification (30 seconds)
1. Run `ctf-binary-probe` on the target binary
2. Check protections: canary, PIE, NX, RELRO, static
3. Run `strings` for quick wins: `win`, `flag`, `system`, `/bin/sh`
4. Check for source code or Dockerfile

## Step 2: Route Selection (30 seconds)
Based on classification:
- **No canary + win symbol** → ret2win immediately
- **Format string visible** → `ctf-pwn-format-map`
- **Heap menu** → `ctf-pwn-heap-menu-map`
- **Static/seccomp** → `ctf-pwn-syscall-orw-check`
- **Need leak** → `ctf-pwn-libc-resolver` + `ctf-pwn-rop-summary`

## Step 3: Template and Execute (5-10 minutes)
1. Copy appropriate template from `templates/pwn_fast_*.py`
2. Fill in offsets, gadgets, and protocol
3. Test locally first
4. Adapt to remote

## Quick Commands
- `probe <binary>` - Run binary probe
- `crash <binary>` - Find crash offset
- `fmt <binary>` - Format string analysis
- `heap <binary>` - Heap menu analysis
- `libc <libc.so>` - Resolve libc symbols
- `exploit` - Run current exploit

## Template Selection
| Evidence | Template | Time Budget |
|----------|----------|-------------|
| No canary + win | `pwn_fast_ret2win.py` | 3 min |
| Format string | `pwn_fast_fmt.py` | 5 min |
| Leak + libc | `pwn_fast_ret2libc.py` | 7 min |
| NX off | `pwn_fast_shellcode.py` | 5 min |
| Static/seccomp | `pwn_fast_orw.py` | 7 min |
| Heap | `pwn_fast_heap.py` | 10 min |
| Complex | `pwn_fast_ret2csu.py` or `pwn_fast_srop.py` | 10 min |

## Success Criteria
- Flag in `agent_flag.txt`
- Reproducible exploit command
- OR: Compact handoff to `ctf-master` if complexity exceeds fast mode

Begin by providing the binary path or challenge description.
