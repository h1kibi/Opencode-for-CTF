---
description: KB workflow: Daily-only browser fallback for anti-bot-failed Xianzhi batch ids
agent: daily
---

# /kb-xianzhi-browser-retry - 对先知批量抓取失败项做浏览器补抓

只允许在 `daily` 模式执行。

## 目标

读取 `xianzhi_fetch_batch.py` 产出的浏览器补抓队列，只对命中 `anti-bot-challenge-page` 的高价值文章逐篇做浏览器态 DOM 提取。

## 输入示例

```text
/kb-xianzhi-browser-retry {env:SECKB_ROOT}/sources\xianzhi\runs\xianzhi-browser-retry-1717670000.txt
```

## 流程

1. 读取失败 id 文件。
2. 对每个 id：
   - browser 打开原始 URL
   - 等待 JS/挑战完成
   - 提取最长正文容器
   - 先保存为 UTF-8 body 文件
   - 调 `xianzhi_save_extracted.py --body-file ...`
3. 成功的条目再进入 `xianzhi_promote_batch.py`。

## 规则

- 只处理失败队列中的高价值条目，不把整批统一切浏览器
- 一次建议处理 1~3 篇，避免超时
- 浏览器态补抓仍需过质量门
