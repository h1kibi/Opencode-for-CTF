---
description: CTF helper: Manage per-challenge exploit-chain ledger state for rigorous solving
agent: ctf-master
---

# /ctf-chain-state - 利用链状态账本

状态文件辅助命令，可在 CTF solving 中使用。默认状态文件：`.ctf-chain-state.json`。

## 初始化

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py init
```

## 导入候选链

先用 `kb_chain_compose.py --json` 输出到文件，再导入：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py import-chains chains.json
```

## 标记链状态

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py set <chain_id> OPEN --reason "early segments confirmed"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py set <chain_id> BLOCKED --reason "WAF blocks traversal payload" --backtrack "try encoding/parser bypass"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py set <chain_id> DEAD --reason "required primitive falsified"
```

## 标记链段状态

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py segment <chain_id> <segment_id> CONFIRMED --reason "readback URL found"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py segment <chain_id> <segment_id> BLOCKED --blocker "stored outside webroot" --backtrack "look for download endpoint"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py segment <chain_id> <segment_id> FALSIFIED --reason "owner/non-owner matrix consistently denied"
```

## 自动观察并更新状态

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py observe <chain_id> <segment_id> "<probe>" "confirmed readback found" --differential "marker visible at returned URL"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py observe <chain_id> <segment_id> "<probe>" "blocked by WAF" --blocker "extension filter" --backtrack "try parser differential"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py observe <chain_id> <segment_id> "<probe>" "no differential same response"
```

## 记录 probe

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py probe <chain_id> <segment_id> "<probe>" "<result>" --differential "<diff>"
```

## 标记分支状态

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py branch <chain_id> <branch_id> BLOCKED --reason "WAF blocks readback" --fallback "parser-transform-to-rce"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py observe-branch <chain_id> <branch_id> "<probe>" "no differential same response" --fallback "<fallback_branch>"
```

## 完成后生成 clean solve

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py finalize <chain_id> --artifact-origin "runtime response" --flag-recorded --note "scoreboard accepted"
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py clean-solve
```

## 报告

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py report
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ctf_chain_state.py clean-solve
```

## 使用规则

- 每个困难目标维护一个 ledger。
- 不要同时推进超过 top-3 条链。
- top chain 两次同族 probe 无新增 differential 后，标记 BLOCKED 或 DEAD。
- 每次 `set` / `segment` / `branch` / `observe` / `observe-branch` 更新链状态后，立即调用 `ctf-decision-state rank`，刷新 `chainRef` 感知排序，避免 `.ctf-chain-state.json` 与 `.ctf-decision-state.json` 失步。
- BLOCKED 链必须记录 blocker 和可尝试 bypass family。
- SOLVED 后停止 broad recon，输出最短复现路径。
