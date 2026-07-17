---
description: KB workflow: 测试 AnySearch / 本地 SecKB / 索引环境是否正常
agent: daily
---

# /kb-brave-test - 本地知识库更新链路测试

> 该命令保留旧名字，但现在测试的是新的本地知识库更新链路，不再依赖旧的 collect_brave.py。

执行以下测试：

### Test 1: AnySearch 可用性
- 用 AnySearch 搜索一个低风险测试主题
- 必要时抽取一篇页面正文
- 确认在线检索可用

### Test 2: 本地 SecKB 检索
```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/search.py "测试 knowledge base retrieval" --limit 3
```

### Test 3: 索引环境
```powershell
{env:SECKB_ROOT}/.venv\Scripts\python.exe -c "import chromadb; import sentence_transformers; print('SecKB index runtime ready')"
```

### Test 4: 写入链路 smoke test
用一个临时测试主题生成一篇简短、安全、无敏感信息的 note，并验证：
- `kb_update.py` 能写入
- 索引能重建
- `search.py` 能召回

测试结束后，如产生临时测试 note，应告知用户路径并询问是否保留。
