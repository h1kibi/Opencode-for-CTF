---
description: CTF helper: Query local SecKB for ranked exploit segments and composed chain candidates from recon evidence
agent: ctf-master
---

# /ctf-kb-chain - 本地知识库链段/利用链命中

只读命令，可在 CTF solving 中使用。禁止写入或更新 KB。

## 输入

`/ctf-kb-chain <compact evidence>`

证据应包含：
- category / framework / language
- route / parameter / object / auth state
- dependency / version / banner / error
- confirmed primitive / oracle / sink
- source leak / debug / token / admin / file read 等信号

## 流程

1. 先查链段：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_segment_match.py "<evidence>" --limit 8
```

2. 再组合链候选：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_chain_compose.py "<evidence>" --limit 5
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_chain_compose.py "<evidence>" --state .ctf-chain-state.json --limit 5
```

3. 如果 top chains 是 PARTIAL/BLOCKED，把缺失条件/堵点反向生成侦察任务：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_recon_tasks.py "<evidence>" --limit 5
```

3b. 如果本地没有足够绕过/补证据知识，生成 focused AnySearch 查询建议：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_gap_search_plan.py "<evidence>" --limit 6
```

4. 如果链段太少，再查 typed chain templates：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_chain_match.py "<evidence>" --limit 5
```

5. 将 top chain 转换成 CTF Chain Ledger 条目，并在后续 hypothesis 中设置 `chainRef=<chain_id>`：
- chain id
- segment states
- typed requires/produces facts
- missing prerequisites
- blockers / WAF
- bypass hints
- branch candidates / fallback branches
- confirm probe
- falsify probe
- likely flag path

6. 通过 `ctf-decision-state` 的 `gate=knowledge`，记录已执行 `segment_match/chain_compose` 且存在 `matchedSegments`。
7. 只尝试最高分且有 flag path 的 OPEN/PARTIAL 链。
8. 不要把 KB 命中当作 payload recipe；必须用当前题目的一变量 probe 验证。
9. 如果 top-2 chain 都无 differential，回到 recon 或 source-guided analysis。
