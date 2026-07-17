---
description: KB workflow: 审查并可选补齐本地 SecKB metadata 缺省值
agent: daily
---

# /kb-curate - 本地知识库整理

只允许在 `daily` 模式执行。

目标：
- 审查 SecKB note 的 metadata 健康度
- 找出低信息量 note
- 识别缺失的 `confidence` / `query_terms` / `verified` 等字段
- 在用户同意时，执行简单默认值补齐

## 流程

### Step 1: 只读审查
先运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_curate.py
```

### Step 2: 解读结果
重点关注：
- 缺失 `confidence`
- 缺失 `query_terms`
- 缺失 `verified`
- 缺失 `source_url`
- `body < 500 chars`

### Step 3: 只做安全、简单的补齐
如果用户同意补齐默认 metadata，则运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_curate.py --write
```

这一步只允许：
- 给缺失项补 `confidence: medium`
- 自动推导 `query_terms`
- 给缺失的 `verified` 补 `false`

不要在这个命令里自动改正文内容。

### Step 4: 如有改动，重建索引并建议 audit
如果有 note 被补齐，建议后续运行：
- `/kb-index`
- `/kb-audit`
