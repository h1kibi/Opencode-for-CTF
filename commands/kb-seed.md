---
description: KB workflow: 为空模块或弱覆盖模块生成 SecKB seed note 骨架
agent: daily
---

# /kb-seed - 本地知识库模块播种

只允许在 `daily` 模式执行。

目标：
- 给空模块或覆盖薄弱模块生成 seed note 骨架
- 方便后续用 `/kb-refresh` 或 `/kb-collect` 补内容

## 流程

### Step 1: 预览将创建哪些 seed
先运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_seed.py
```

### Step 2: 用户确认后创建
如果用户同意，再运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_seed.py --write
```

### Step 3: 生成结果
seed note 只提供模块骨架，不代表真实知识已补全。后续应继续：
- `/kb-refresh <module>`
- `/kb-collect <topic>`
- `/kb-index`

### Step 4: 推荐顺序
优先 seed 这些模块：
- `web/jwt`
- `web/upload`
- `web/idor`
- `web/race`
- `pwn`
- `crypto/rsa`
- `rev`
- `forensics`
