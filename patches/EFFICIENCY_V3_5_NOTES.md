# Efficiency v3.5 CTF Fast Patch

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

目标：CTF agent 以效率为第一，同时提高直接命中率和可解题覆盖面。

## 改动摘要

1. `ctf-agent` prompt 缩短并改成更强的 fast-lane router：
   - 首轮强制优先 `ctf-one-shot-triage`。
   - 已知 flag 格式时传 `flagPattern`。
   - archive 后固定 `ctf-safe-extract -> ctf-one-shot-triage(extracted)`。
   - 未解前固定对 target/work/extracted 跑 `ctf-flag-grep`。
   - 限制无证据 subagent 派发，最多先派一个专项 agent。

2. CTF bash 权限优化：
   - 放开常见本地 CTF 快速命令：`py *`、`sage *`、`chmod +x *`、`gdb -q -batch *`、本地 `timeout` 包裹运行、`docker compose up/build/down`、本地 `nmap`。
   - 保留破坏性与外部横向移动类 deny：`rm`、`rm -rf`、`ssh`、`scp`、`del`、`Remove-Item`。

3. 工具覆盖面增强：
   - `ctf-one-shot-triage` 新增 `flagPattern`。
   - `ctf-safe-extract` 新增 `flagPattern`。
   - `ctf-flag-grep` 新增 `flagPattern` alias。
   - 默认 flag regex 从单一 `{}` 扩展为 `{}`、`[]`、`flag-`/`flag_`/`flag:` 风格。

4. CTF workspace 模板改成更激进的轻量启动配置：
   - `default_agent = ctf-agent`。
   - 关闭 snapshot。
   - 禁用 browser/brave/obsidian/markitdown/filesystem/github 等无关 MCP。
   - 收紧 tool output 与 compaction。

5. `/ctf` 命令同步：
   - 明确已知 flag 格式时使用 `flagPattern`。
   - 明确 archive 提取后立即 rerun one-shot triage。

## 使用建议

- 日常开发：继续使用全局 `opencode.jsonc`，默认 agent 仍是 `daily`。
- CTF：把 `CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc` 复制到 CTF workspace 作为 `opencode.jsonc` 或 `.opencode/opencode.jsonc`，然后从 CTF workspace 启动 opencode。
- 每题开始时优先把附件放在 workspace 内，减少 external_directory 权限摩擦。

## 注意

这个版本假设 CTF workspace 是隔离目录/虚拟机环境，因此对本地命令更宽松。不要把 CTF workspace 模板用于普通项目目录。
