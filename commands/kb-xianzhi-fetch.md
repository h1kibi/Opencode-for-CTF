---
description: KB workflow: Daily-only fetch a public Xianzhi article into local SecKB source storage
agent: daily
---

# /kb-xianzhi-fetch - 抓取公开先知文章到本地源仓

只允许在 `daily` 模式执行。

输入形式：

```text
/kb-xianzhi-fetch 7670
/kb-xianzhi-fetch https://xz.aliyun.com/t/7670
```

## 目标

把公开先知文章抓到本地：

- `C:\Users\Administrator\SecKB\sources\xianzhi\raw`
- `C:\Users\Administrator\SecKB\sources\xianzhi\clean`
- `C:\Users\Administrator\SecKB\sources\xianzhi\metadata`
- `C:\Users\Administrator\SecKB\sources\xianzhi\summaries`

## 执行方式

优先使用本地抓取脚本：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\sources\xianzhi\xianzhi_fetch_article.py <id-or-url> --json
```

如果返回 `anti-bot-challenge-page`、`listing-or-homepage-pattern`、`generic-title-with-navigation-signals` 等质量门错误，切换到浏览器态抓取：

1. 用 browser MCP 打开原始 URL。
2. 等待页面完成 JS/挑战加载。
3. 用 `browser_evaluate` 提取：
   - `document.title`
   - 最长 article/content/detail 容器正文
   - `location.href`
   - 图片元数据：`src` / `alt` / 图注 / 周边文本
4. 将正文先保存成 UTF-8 文本文件，再传给落盘脚本，避免 PowerShell here-string 或终端编码链路把中文正文变成 `????`：

```powershell
$tmp = "C:\Users\Administrator\SecKB\sources\xianzhi\raw\<id>.browser-body.txt"
# 图片元数据 JSON 也单独写成 UTF-8 文件，例如 <id>.browser-images.json
# 先把 browser_evaluate 结果按 UTF-8 写入 $tmp
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\sources\xianzhi\xianzhi_save_extracted.py --id <id> --url "<url>" --kind <t|news|browser> --title "<title>" --body-file "$tmp" --images-file "<images-json>" --json --force
```

默认使用代理：`http://127.0.0.1:7897`

## 规则

- 只抓公开文章，不使用登录态私有内容
- 不保存 cookie / session / token
- 抓取后先检查 clean markdown 质量，再决定是否继续 promote 到正式 KB
- 如果抓取内容太短、被风控、或页面结构异常，报告需要人工复核
- 如果 HTTP 抓取命中反爬挑战页，必须改走浏览器态 DOM 提取，不要把 challenge payload 当正文保存
- 浏览器态正文默认应走 `--body-file` 路径，避免中文编码污染
- 图片内容默认先提取元数据（src/alt/图注/周边文本）；必要时再做选择性 OCR，不做全量 OCR

## 输出

- article id
- title
- raw/clean/meta/summary 文件路径
- clean 内容长度
- 是否建议继续 `/kb-xianzhi-promote`
