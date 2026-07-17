# OpenCode 全局规则 (Chinese Rules)

## 语言与交互
- 用户使用中文时，用中文回复
- 代码、命令、文件名、技术术语保持原文，不翻译
- 解释技术概念时优先中文，必要时附带英文术语

## 文件与代码
- 不主动创建 README、CHANGELOG、SUMMARY 等文档文件，除非明确要求
- 代码中的注释默认不添加，除非用户要求
- 避免在已有代码中插入大量注释说明
- 修改代码时遵循文件现有的编码风格和缩进规范（Tab/空格、命名风格）

## 安全
- 不记录、不输出、不提交任何密钥或敏感信息
- .env 文件内容不可读取展示
- 涉及 rm/del/Remove-Item 等删除操作必须用户确认

## 操作习惯
- 编辑文件优先用 edit 工具，小改动不要重写整个文件
- 执行可能有副作用的命令前先说明
- 批量操作时先列出计划，确认后再执行

## 网络
- 上网请求（curl、wget、Invoke-WebRequest 等）默认使用环境变量 `HTTP_PROXY` 或 `HTTPS_PROXY` 中指定的代理
- 如果以上环境变量未设置，则直接连接不使用代理
- PowerShell 示例：`Invoke-WebRequest -Proxy "$env:HTTP_PROXY" ...`
- curl 示例：`curl -x "$HTTP_PROXY" ...`

## Git
- 不主动 commit，除非用户要求
- commit message 简洁，用英文

