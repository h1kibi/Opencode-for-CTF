---
description: KB workflow: 使用本地 SecKB 主路径做权威来源采集、精炼、写入与索引更新
agent: daily
---

# /kb-collect - 本地知识库采集与更新

当用户说 `/kb-collect <主题>` 时，只允许在 `daily` 模式执行。不要在任何 CTF solving agent 内执行。

## 目标

围绕用户主题，从权威来源主动检索、抓取、精炼、整理，并把可复用知识写入：

- `C:\Users\Administrator\SecKB\notes`
- `C:\Users\Administrator\SecKB\index\chroma`

## 固定流程

### Step 1: 明确模块和目标
将主题映射到知识模块，例如：
- `web/java`
- `web/xss`
- `web/ssrf`
- `web/upload`
- `pwn`
- `crypto/rsa`
- `rev`
- `forensics`

如果用户没指定模块，先根据主题判断一个最贴近的模块。

### Step 2: 制定权威来源检索计划
优先用权威来源，不要从低质量聚合站开始。

优先级：
1. 官方文档 / 官方安全公告
2. 官方源码仓库 / release notes / commit / issue
3. CERT / NVD / GHSA / vendor advisory
4. 维护良好的技术博客 / 工具文档 / 高质量研究文章
5. GitHub 项目与 PoC 参考（只读分析，不执行）

至少生成 6 个检索 query，覆盖：
- 官方行为说明
- 漏洞/利用模式
- 版本边界
- 常见误报 / false positive
- 检测 / 缓解 / defense perspective
- 代表性源码或工程实现

### Step 3: 在线检索与抽取
优先使用 AnySearch：
- `list_domains`（如果是 CVE / 学术 / 结构化领域）
- `search`
- `batch_search`
- `extract`

必要时辅以：
- GitHub MCP（只读）
- Context7 文档
- markitdown 对网页/PDF 做 markdown 提取
- 先知社区公开文章：作为中文安全社区补充来源。优先抓到 `SecKB\\sources\\xianzhi`，再提炼成 note，不直接把全文并入 KB。

对候选来源，先用 authority scorer 做排序：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\authority_rank.py <url1> <url2> <url3>
```

### Step 4: 只保留高质量来源
筛掉：
- 登录页
- 内容太少的摘要页
- 纯导航页
- 转载且无新增技术细节的页面
- 和主题关系弱的文章

每次更新建议保留 3~8 个高质量来源，而不是盲目求多。

对于先知社区：
- 只使用公开文章
- 优先保留原始 URL 与 clean markdown
- 如果是 community writeup，必须补 `false positive` 与 `first verification clue`，避免 agent 盲信复现文

### Step 5: 精炼成可复用模式笔记
写入笔记时，目标不是存整篇原文，而是生成可复用知识：
- winning signal / first signal
- primitive 或核心利用模式
- 版本边界 / framework 行为差异
- 常见 false positive
- 典型 query terms
- 可验证的 first check

严禁写入：
- flags
- cookies
- session IDs
- live target credentials
- private keys
- 一次性 challenge secrets

### Step 6: 写入 SecKB
使用：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_update.py --module <module> --title "<title>" --stdin --source anysearch --source-url "<url>" --stack <stack...> --primitive <primitive...> --query "<query>" --query-terms <terms...> --confidence high
```

对于已经确认稳定、可复用的知识，可以加 `--verified`。

### Step 7: 重建索引并做 smoke test
默认 `kb_update.py` 会重建索引。
之后至少执行一次检索 smoke test：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\search.py "<evidence query>" --limit 5 --category <category>
```

### Step 8: 向用户报告
报告：
- 更新到哪个模块
- 参考了哪些高质量来源
- 新增/覆盖了多少篇 note
- 是否完成索引重建
- smoke test 是否能正确召回
- 后续建议补充的相邻模块

如有需要，再运行：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\kb_quality_report.py
```

检查模块覆盖和 metadata 健康度。
