---
description: KB workflow: Daily-only keyword extraction, candidate filtering, low-rate batch fetch, and promote for Xianzhi source enrichment
agent: daily
---

# /kb-xianzhi-batch - 先知小批量丰富本地知识库

只允许在 `daily` 模式执行。

## 目标

当用户只给出模块或主题时，agent 需要：

1. 提取关键词
2. 生成中文/英文混合检索词
3. 在本地先知审计索引中筛候选文章
4. 小批量抓取，降低引起注意或触发反爬的概率
5. 清洗/提炼
6. promote 到正式 SecKB note
7. 重建索引并 smoke test

## 输入示例

```text
/kb-xianzhi-batch rev/android frida jni 脱壳
/kb-xianzhi-batch web/upload 文件上传 绕过 解析漏洞
/kb-xianzhi-batch rev custom vm opcode dispatcher z3
```

## 固定流程

### Step 1: 提取关键词
从用户主题提取 4~10 个关键词，优先：
- 技术栈/语言/框架
- 漏洞或模式名
- 工具名
- 关键 primitive
- 中英文同义词

例如：
- `rev/android frida jni 脱壳`
- `android apk frida jni hook so native`

### Step 2: 本地候选筛选
先从先知本地审计索引筛候选，而不是直接全网乱抓：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\xianzhi_fetch_batch.py "<query>" --module <module> --limit-candidates 20 --batch-size 5 --json
```

### Step 3: 小批量抓取
默认一轮只抓 3~5 篇，必要时逐轮推进：
- 第一轮：抓 3 篇看质量
- 第二轮：再抓 3~5 篇
- 每次都保留失败日志
- 默认 `--sleep-ms 1200` 以上

如果命中反爬挑战页，单篇改走 `/kb-xianzhi-fetch` 的浏览器态路径，不对整批统一切浏览器。

### Step 4: 批量 promote
抓到 clean 正文后，批量 promote：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\xianzhi_promote_batch.py --module <module> --ids <id1> <id2> <id3> --no-index
```

### Step 5: 统一重建索引
全部写完后统一重建：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ingest.py
```

### Step 6: smoke test
用该主题的 evidence query 做一次检索验证：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\search.py "<evidence query>" --category <category> --limit 5
```

## 规则

- 不要求一轮抓很多，优先低噪声持续丰富
- 不把整篇原文并入正式 KB；正式 KB 只存 decision note
- 如果候选质量低、主题偏资讯/招聘/活动，直接跳过
- 如果文章与模块不一致，不强行 promote
- 先知优先作为中文社区补充源，低于官方来源优先级

## 输出

- 提取出的关键词
- 选中的候选文章 ID/标题
- 成功抓取数 / 失败数
- 成功 promote 数 / 失败数
- 索引是否重建
- smoke test 查询和结果
