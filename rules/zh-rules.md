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


## CTF Agent Equipment
- CTF agent tool/MCP/environment equipment is declared in `rules/agent-equipment.md`.

## 默认 Flag 判定

除非题目或用户明确指定了其他格式，所有 Agent 默认遵循 `skills/ctf-common/references/flag-identification-rules.md`：

- 优先接受 `prefix{payload}`：前缀 3–10 位字母数字，payload 10–60 位，仅允许字母、数字、`_`、`-`、`@`、`!`，禁止空白和换行。
- UUID 形态的 `flag{...}` 可作为高置信度候选。
- 不带前缀的 MD5/SHA-256 默认拒绝；只有同一证据明确出现 `flag.txt`、`.flag`、`/flag`、`readflag`、`getflag` 或读取这些来源的命令时才接受为中置信度候选。
- 正则命中只是候选，不是解题成功；必须经过独立的精确值、文件或 hash oracle 才能报告已验证。
- 不得因短样例、诱饵、普通 hash 或未验证候选写入 `agent_flag.txt`。
