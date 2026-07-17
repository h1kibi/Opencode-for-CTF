---
description: KB workflow: Daily-only local knowledge base refresh from authoritative sources
agent: daily
---

# /kb-refresh - 本地知识库自我更新工作流

只允许在 `daily` 模式执行。

如果当前在任何 CTF solving agent（如 `ctf-fast` / `ctf-master` / `ctf-web` / `ctf-pwn` 等）中，必须停止并要求切回 `daily`。原因：更新知识库会影响解题速度、污染当前证据上下文、改变检索结果，不允许在解题过程中执行。

## 目标

让 agent 主动从权威来源完成：
- 在线检索
- 正文抓取
- 去噪和精炼
- 结构化整理
- 写入本地 SecKB
- 重建索引
- 检索验证

## 输入

`/kb-refresh <主题或模块>`

例如：
- `/kb-refresh spring 路径规范化差异`
- `/kb-refresh web/jwt`
- `/kb-refresh CVE-2024-xxxx`

## 固定流程

### Step 1: 确定目标模块
从主题映射到一个模块：
- `web/java`
- `web/xss`
- `web/ssrf`
- `web/jwt`
- `web/upload`
- `pwn`
- `crypto/rsa`
- `rev`
- `forensics`

### Step 2: 生成检索计划
至少生成 6 个 query，覆盖：
- 官方行为说明
- 漏洞/模式本体
- 版本边界
- false positive
- defense/mitigation perspective
- GitHub/源码/实现细节

如果主题明显属于结构化领域，优先走 AnySearch vertical search：
- CVE / GHSA / vendor advisory
- academic / DOI
- health / drug
- finance / stock

对于这类 query，先 `list_domains`，再按正确 `sub_domain` 和 `query_format` 搜索。

### Step 3: 只查权威或高质量来源
优先级：
1. 官方文档 / 官方安全公告
2. NVD / GHSA / vendor advisory / CERT
3. 官方源码仓库 / commits / issues / release notes
4. 高质量技术博客 / maintained tool docs
5. GitHub 项目与 PoC 参考（只读）
6. 中文安全社区补充来源：先知社区公开文章（适合补中文经验、实战模式、CTF/漏洞复现细节），但默认低于官方来源优先级

抓取到候选 URL 后，优先用本地 authority scorer 做一次排序：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/authority_rank.py <url1> <url2> <url3>
```

优先保留 `authoritative` / `strong` 级来源，再进入正文提取。

### Step 4: 抓取与精炼
对高质量来源做正文提取，整理出：
- first signal
- primitive / 利用模式
- version gate
- false positive
- query terms
- first verification clue

如果来源是先知社区：
- 先用 `/kb-xianzhi-fetch` 或本地 `xianzhi_fetch_article.py` 保存 raw/clean/metadata
- 再做精炼，不把全文直接写入 SecKB
- 对 community 文章补充 `false positive`、`version gate`、`first safe check`

如果主题以源码/实现细节为主，优先读官方仓库、release、issue、commit；如果主题以框架行为为主，优先读官方 docs / Context7；如果主题是漏洞或 advisory，优先读 NVD / GHSA / vendor advisory，再补技术博客。

### Step 5: 写入 SecKB
通过 `kb_update.py` 写入结构化笔记。不要写原始整篇网页，不要写一次性挑战细节。

如果提炼出了可复用利用链，写入时补充：
- `--chain <chain-id...>`
- `--produces <file-read admin token flag rce...>`

常见 chain-id 示例：
- `file-read-to-flag`
- `source-leak-to-exploit`
- `ssrf-to-internal-secret`
- `xss-adminbot-to-secret`
- `upload-to-rce-or-readback`
- `sqli-to-flag-or-admin`
- `jwt-session-to-admin`
- `java-dependency-to-sink`

### Step 6: 重建索引
默认重建 `{env:SECKB_ROOT}/index\chroma`。

### Step 7: smoke test
用至少一个 evidence query 验证新 note 可检索。

### Step 8: KB 质量检查
必要时运行：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_quality_report.py
```

查看：
- 模块覆盖
- 空模块
- metadata 缺失
- 低信息量 note

如果是存量 note 整理问题，进一步运行 `/kb-curate`。

如需做完整健康检查，改用 `/kb-audit`。

### Step 9: 报告
告诉用户：
- 更新了哪个模块
- 新增/覆盖了哪些 note
- 使用了哪些关键来源
- 是否通过 smoke test
- 建议下一步补哪些相邻模块
