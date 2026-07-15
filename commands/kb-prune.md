---
description: KB workflow: 审查重复、相似、低价值 note，安全地规划清理
agent: daily
---

# /kb-prune - 本地知识库去重与清理规划

只允许在 `daily` 模式执行。

目标：
- 找出完全重复 note
- 找出同模块下高相似 note
- 找出低价值或 seed note
- 只做审查和清理建议，不自动删除文件

## 流程

### Step 1: 生成 prune report
先运行：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_prune.py
```

### Step 2: 分类解释结果
重点看：
- `Exact Body Duplicates`
- `Title Collisions`
- `High-Similarity Pairs`
- `Low-Value / Review Notes`

### Step 3: 只给安全建议
对每组结果给出建议：
- 保留哪篇
- 哪篇应合并内容
- 哪篇只是 seed，需要后续补实质内容
- 哪篇可以考虑人工删除

### Step 4: 不自动删除
该命令默认不删除任何 note。
如果用户要真正删文件，必须单独确认，并且建议先备份或移动到临时目录。

### Step 5: 后续动作建议
按情况建议用户继续：
- `/kb-curate`
- `/kb-seed`
- `/kb-refresh`
- `/kb-index`
- `/kb-audit`
