---
description: KB workflow: 研究 GitHub 项目（只读），提取可复用知识写入本地 SecKB
agent: daily
---

# /kb-github - GitHub 项目入库

使用 GitHub MCP（只读）研究指定项目，并把可复用信息写入本地 SecKB。

## 目标路径

- notes: `{env:SECKB_ROOT}/notes`
- index: `{env:SECKB_ROOT}/index\chroma`

## 流程

### Step 1: 获取仓库信息
使用 GitHub MCP 获取：
- README
- 关键目录结构
- 最近 commits
- issues / PRs（如果和主题强相关）
- 依赖与版本信息

### Step 2: 提取可复用信息
优先提取：
- 项目用途和核心功能
- 安装和配置步骤
- 与 CTF/安全的关联
- 可复用的技术点
- 可作为 pattern 的 first signal / primitive / false positive / query terms

### Step 3: 写入 SecKB
将结果写入：
`{env:SECKB_ROOT}/notes\<module>\<slug>.md`

推荐通过：

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_update.py --module <module> --title "<title>" --stdin --source github --source-url "<repo-or-file-url>" --stack <stack...> --primitive <primitive...> --query "<query>" --query-terms <terms...>
```

### Step 4: 重建索引并验证
写入后默认重建索引，并做一次本地检索 smoke test。
