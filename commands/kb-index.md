---
description: KB workflow: 重建本地 SecKB 向量索引并验证可检索性
agent: daily
---

# /kb-index - 本地向量索引重建

将 `C:\Users\Administrator\SecKB\notes` 下的 Markdown 笔记写入本地 Chroma 索引：

- notes: `C:\Users\Administrator\SecKB\notes`
- index: `C:\Users\Administrator\SecKB\index\chroma`
- config: `C:\Users\Administrator\SecKB\config\seckb.yaml`

## 流程

### Step 1: 检查 Chroma / embedding 环境
```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe -c "import chromadb; import sentence_transformers; print('ChromaDB ready:', chromadb.__version__)"
```

### Step 2: 执行重建
```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\ingest.py --config C:\Users\Administrator\SecKB\config\seckb.yaml
```

### Step 3: smoke test
至少用一个 query 验证召回：

```powershell
C:\Users\Administrator\SecKB\.venv\Scripts\python.exe C:\Users\Administrator\SecKB\scripts\search.py "spring file read path traversal" --limit 5 --category web
```

### Step 4: 报告
- 索引了多少个 chunk
- 使用的 collection 名称
- 索引目录路径
- smoke test 是否成功召回
- 如需完整系统检查，运行 `/kb-audit`
