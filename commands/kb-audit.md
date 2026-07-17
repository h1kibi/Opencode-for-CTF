---
description: KB workflow: 一键审计本地 SecKB/CVEKB 环境、索引、检索与质量健康度
agent: daily
---

# /kb-audit - 本地知识库健康审计

只允许在 `daily` 模式执行。

目标：在不进入 CTF solving 工作流的前提下，一次性检查本地知识系统是否健康，包括：
- Python 依赖
- SecKB 索引环境
- 本地检索可用性
- authority ranking helper 可用性
- KB 质量报告
- CVEKB CLI 可用性

## 固定流程

### Step 1: 依赖检查
检查 SecKB venv 是否具备：
- chromadb
- sentence-transformers
- PyYAML
- mcp
- packaging

### Step 2: 索引环境检查
确认：
- `{env:SECKB_ROOT}/notes`
- `{env:SECKB_ROOT}/index\chroma`
- `{env:SECKB_ROOT}/config\seckb.yaml`

### Step 3: SecKB 检索 smoke test
运行一个低风险 query，确认 `search.py` 能返回结果或至少正常执行。

### Step 4: Authority scorer 检查
运行 `authority_rank.py --help` 或对少量已知官方 URL 做排序，确认 authority ranking helper 正常。

### Step 5: 质量仪表盘
运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_quality_report.py
```

检查：
- 模块覆盖
- 空模块
- metadata 缺失
- 低信息量 note

### Step 6: CVEKB CLI 检查
运行 `cvekb.py --help`，确认本地 CVEKB 入口正常。

### Step 7: 汇总报告
输出：
- 依赖是否齐全
- 检索是否正常
- authority scorer 是否正常
- KB 质量主要问题
- CVEKB 是否正常
- 建议下一步（补模块 / 补 metadata / 重建索引 / 更新来源）

如果审计发现：
- metadata 缺失较多，建议运行 `/kb-curate`
- 空模块较多，建议运行 `/kb-seed`
- 重复或相似 note 较多，建议运行 `/kb-prune`
