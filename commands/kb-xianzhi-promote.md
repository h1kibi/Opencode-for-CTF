---
description: KB workflow: Daily-only promote a fetched Xianzhi article into a structured SecKB note
agent: daily
---

# /kb-xianzhi-promote - 把先知文章提升为 SecKB 结构化 note

只允许在 `daily` 模式执行。

输入形式：

```text
/kb-xianzhi-promote 7670 --module rev/android
/kb-xianzhi-promote 9561 --module web/upload
```

## 目标

把已抓取的先知 clean 文章提炼成可复用 note，而不是保存全文复读。

## 固定流程

1. 先确认文章已通过 `/kb-xianzhi-fetch` 进入本地源仓。
2. 先用 `xianzhi_search.py` / 审计结果看模块建议，避免误分类。
3. 运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/xianzhi_promote.py --id <id> --module <module> --write
```

4. promotion 后检查 note：
   - first signal
   - false positive
   - query terms
   - chain / primitive
   - 无 flag / token / secret
5. 用 `search.py` 做 smoke test。

## 规则

- 目标产物是 decision note，不是整篇先知原文镜像
- 不要保存一次性 payload 噪音，优先保存 reusable pattern
- 如果文章质量弱、模块不清、或内容重复，允许放弃 promote

## 输出

- note 路径
- 模块
- 来源 URL
- 是否重建索引
- smoke test query 与结果
