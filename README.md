# Opencode for CTF

[English](./README_EN.md)

**opencode-for-ctf** 是一个面向 [OpenCode](https://opencode.ai) 的 CTF 自动化解题 Agent 插件。

它不是单一 prompt，而是一套围绕 **agents / commands / skills / tools** 组织的插件式 Agent 工程方案，为 CTF 解题提供结构化、可复用、可扩展的能力。

> **仅限授权场景。** 只用于你有权测试的 CTF、靶场、基准测试和本地实验。禁止对未授权目标使用。详见 [SECURITY.md](./SECURITY.md)。

## 默认用法

安装并重启 OpenCode 后，大多数情况只需要：

```text
/ctf ./challenge
```

`/ctf` 会先走内置 category 路由（工具 `ctf-route-plan`），再进入 `ctf-fast` 或 `ctf-expert` 解题流水线。family 只影响能力包与工具面，不是独立 primary agent。更多入口见 `/help`。

## 特性

- **单一默认入口** — `/ctf` 自动路由；需要时再强制 `/ctf-fast` / `/ctf-expert`
- **两大主 Agent** — `ctf-fast`（轻量快速）与 `ctf-expert`（证据驱动全面分析）
- **全题型覆盖** — Web / Pwn / Rev / Crypto / Forensics / Misc
- **160+ 工具** — 文件分析、Web 探测、二进制调试、密码学、取证等（L2 专家工具按需）
- **60+ 技能** — 各题型方法论沉淀为可复用 skill
- **命令分层** — L0 默认面极小；微命令保留给进阶场景
- **证据驱动** — `ctf-expert` 通过 **Evidence.md** 追踪已知信息，迭代逼近 flag
- **Beta Team Mode** — `ctf-expert` 可并发调度 2–8 个隔离 worker
- **路径安全层** — 工作区边界、`CTF_ALLOWED_ROOTS`、敏感路径拒绝
- **可配置 hooks** — 可选 `opencode-for-ctf.jsonc` 关闭 hashline / continuation 等
- **Tool packs** — 默认不加载 android/godot；可用配置或环境变量打开
- **受管安装** — `npm run ctf:install` 部署到 OpenCode 配置目录，支持 upgrade / uninstall / doctor

## 要求

| 项目     | 版本 / 说明                                                    |
| -------- | -------------------------------------------------------------- |
| Node.js  | `>= 22.20.0`（见 `package.json` engines）                      |
| OpenCode | 支持 plugin / agents / skills 的近期版本                       |
| OS       | Windows / Linux / macOS（部分 PWN/REV 工具依赖 WSL 或 Docker） |

## 快速开始

完整安装说明见 **[INSTALL.md](./INSTALL.md)**。运行时与安装默认策略的边界说明见 **[docs/lifecycle-and-defaults.md](./docs/lifecycle-and-defaults.md)**，维护者架构速览见 **[docs/architecture-notes.md](./docs/architecture-notes.md)**。下面是最短路径。

### 1. 源码安装（当前推荐）

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
npm install
npm run check
npm run ctf:install
npm run ctf:status -- --strict
```

安装器会：

1. 构建自包含插件 bundle（`dist/plugin`）
2. 将 `agents/` 与 `commands/` 安装到 OpenCode 配置目录根部，使 `/ctf`、`/help`、`ctf-fast`、`ctf-expert` 与各分类 subagent 重启后可见
3. 将内置 `skills/`、rules、templates、RAG/knowledge、便携 MCP 后端（如 WireMCP）与插件 bundle 安装到 `opencode-for-ctf/`
4. 以最小 JSONC 编辑合并进现有 `opencode.jsonc`（保留注释与用户配置），默认写入：
   - `plugin[]`：指向受管插件 bundle
   - `skills.paths[]`：发布内置 CTF skill 目录
   - `instructions[]`：加载 CTF 规则与 agent equipment 规则
   - profile 对应的 MCP stub：默认禁用，按需启用
5. 写 manifest（SHA-256），便于后续 upgrade / uninstall 且不覆盖用户改过的托管文件

默认 profile 为 **`full`**：注册所有受支持的 CTF MCP stub，但全部保持 `enabled:false`，需要显式启用或由 `ctf-expert` 批准后使用。重启 OpenCode 后执行：

```text
/help
/ctf ./challenge
```

### 2. 交给 LLM Agent 安装

把下面这段话原样发给 OpenCode / Claude Code / 其他编程 Agent：

> 请从 `https://github.com/h1kibi/Opencode-for-CTF.git` 克隆项目，阅读 `README.md`、`INSTALL.md` 与 `SECURITY.md`，确认 Node.js 满足 `>=22.20.0`，然后运行 `npm install`、`npm run check`、`npm run ctf:install` 和 `npm run ctf:status -- --strict`。使用默认 `full` profile；它只注册默认禁用的 MCP stub，不要启用任何 MCP，也不要修改我的 provider/model 配置。若安装或检查失败，停止并把准确错误返回给我；不要删除或覆盖我修改过的配置文件。

### 3. npm / CLI（registry 上线后）

```bash
npx opencode-for-ctf install
npx opencode-for-ctf status --strict
```

在包真正发布到 npm 之前，请使用源码目录下的 `npm run ctf:install`。CLI 与 `prepack` 已按发布形状准备好。

### 常用管理命令

```bash
npm run ctf:status      # 安装健康检查
npm run ctf:upgrade     # 升级托管文件（保留用户修改）
npm run ctf:uninstall   # 卸载托管安装
npm run doctor          # 安装 doctor
npm run ctf:help        # CLI 帮助
```

隔离配置目录做测试（PowerShell）：

```powershell
$env:XDG_CONFIG_HOME="$PWD\.tmp-xdg"
$env:OPENCODE_CONFIG_DIR="$env:XDG_CONFIG_HOME\opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

Bash：

```bash
export XDG_CONFIG_HOME="$PWD/.tmp-xdg"
export OPENCODE_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
npm run ctf:install
npm run ctf:status -- --strict
```

## 可选配置

### 插件用户配置

复制 [`opencode-for-ctf.example.jsonc`](./opencode-for-ctf.example.jsonc) 为：

- 项目根目录：`opencode-for-ctf.jsonc`，或
- OpenCode 配置目录：`~/.config/opencode/opencode-for-ctf.jsonc`

可配置项包括：

| 字段                                      | 作用                                          |
| ----------------------------------------- | --------------------------------------------- |
| `default_mode`                            | `/ctf` 默认强度：`auto` \| `fast` \| `expert` |
| `disabled_hooks`                          | 关闭个别 runtime hooks                        |
| `hashline` / `continuation` / `team_mode` | 功能开关                                      |
| `tool_packs` / `expert_tool_packs`        | 启动时注册的工具包                            |
| `external_skills`                         | 是否纳入外部 skills 路径                      |

### 工作区配置

参考 [`CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc`](./CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc)，复制到 CTF 工作区后从该目录启动 OpenCode。

### 环境变量（按需）

| 变量                                     | 用途                                        |
| ---------------------------------------- | ------------------------------------------- |
| `DEEPSEEK_API_KEY`                       | DeepSeek API Key                            |
| `GITHUB_PAT`                             | GitHub Personal Access Token（只读即可）    |
| `GHIDRA_INSTALL_DIR`                     | Ghidra 安装目录                             |
| `JADX_MCP_COMMAND` / `JADX_HOME`         | JADX MCP 启动命令 / JADX 安装目录           |
| `GDB_MCP_COMMAND`                        | GDB MCP 启动命令                            |
| `MYSQL_MCP_COMMAND`                      | MySQL MCP 启动命令                          |
| `MYSQL_HOST` / `MYSQL_PORT`              | MySQL MCP 目标连接地址                      |
| `MYSQL_USER` / `MYSQL_PASSWORD`          | MySQL MCP 认证信息                          |
| `MYSQL_DATABASE`                         | MySQL MCP 默认数据库                        |
| `X64DBG_MCP_COMMAND` / `X64DBG_PATH`     | x64dbg MCP 启动命令 / x64dbg 路径           |
| `SSH_MCP_COMMAND`                        | SSH MCP 启动命令                            |
| `SSH_MCP_HOST` / `SSH_MCP_PORT`          | SSH MCP 目标连接地址                        |
| `SSH_MCP_USER` / `SSH_MCP_KEY`           | SSH MCP 认证信息                            |
| `JINA_API_KEY` / `BRAVE_API_KEY` 等      | 搜索 / 抓取类 MCP                           |
| `CTF_ALLOWED_ROOTS`                      | 额外允许的文件根（Windows `;`，Unix `:`）   |
| `CTF_ALLOWED_HOSTS`                      | 额外允许的 Web 探测主机                     |
| `OPENCODE_CTF_TOOL_PACKS`                | 覆盖 tool packs，如 `all` 或 `core,web,pwn` |
| `OPENCODE_CONFIG_DIR`                    | 覆盖 OpenCode 配置目录                      |
| `OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1` | 安装时复制外部 SecKnowledge 参考 skill（体积大）         |

完整 `.env` 模板见 [`.env.example`](./.env.example)。**不要提交真实密钥。**

### 默认 MCP 后端建议

当前项目推荐的 MCP 后端组合如下：

- `browser` → `@playwright/mcp`
- `wireshark-mcp` → 内置 WireMCP（full profile 写入受管安装目录中的 `WireMCP/index.js`）
- `ida-pro` → `mrexodia/ida-pro-mcp`（要求 `ida-pro-mcp` 可直接执行；stdio 为默认 transport）
- `jadx-mcp` → 通过 `{env:JADX_MCP_COMMAND}` 外部接入
- `gdb-mcp` → 通过 `{env:GDB_MCP_COMMAND}` 外部接入
- `mysql-mcp` → 通过 `{env:MYSQL_MCP_COMMAND}` 外部接入，并读取 `MYSQL_*`
- `x64dbg-mcp` → 通过 `{env:X64DBG_MCP_COMMAND}` 外部接入
- `ssh-mcp` → 通过 `{env:SSH_MCP_COMMAND}` 外部接入，并读取 `SSH_MCP_*`
- `cyberchef-mcp` → 通过 `{env:CYBERCHEF_MCP_COMMAND}` 外部接入（npm 无官方包，需自备后端；默认不启用）
- `ctfd-mcp` → 通过 `npx -y ctfd-mcp-server` 使用，默认不启用

默认 family 开启策略：

- `ctf-web` / `ctf-scout` / `ctf-expert`：`browser`
- `ctf-web`：可请求 `jadx-mcp` / `mysql-mcp` / `ssh-mcp`
- `ctf-pwn`：可请求 `gdb-mcp` / `ida-pro` / `ssh-mcp`
- `ctf-rev`：`ReVa`，可请求 `ida-pro` / `jadx-mcp` / `gdb-mcp` / `x64dbg-mcp` / `ssh-mcp`
- `ctf-forensics`：`wireshark-mcp` + `cyberchef-mcp`，可请求 `mysql-mcp` / `ssh-mcp`
- `ctf-crypto`：`cyberchef-mcp`
- `ctf-misc`：`wireshark-mcp` + `cyberchef-mcp`，可请求 `mysql-mcp` / `ssh-mcp`
- `ctf-aisec`：AI 安全专项（LLM Agent、提示注入、对抗样本、模型工件、RAG/工具边界与不安全序列化）

高成本能力（如 `ida-pro`、`jadx-mcp`、`gdb-mcp`、`mysql-mcp`、`x64dbg-mcp`、`ssh-mcp`、`flutter-aot`、`ctfd-mcp`、`anysearch`）保持按需启用；受管安装的 full profile 只写入 disabled MCP stub。

### 外部 skills

`npm install` **不会**自动联网拉取；默认 npm 包也不包含 `skills-external/` 或历史 pattern-card 版本（仅 `v9` 运行时索引）。源码检出若需要 `Pa55w0rd/secknowledge-skill` 参考快照：

```bash
npm run fetch-skills
```

许可与归属见 [`third_party/NOTICE.md`](./third_party/NOTICE.md)。更多瘦包说明见 [INSTALL.md](./INSTALL.md#slim-package-contents)。

## 手动配置（不推荐）

若不想用受管安装器，可在 `~/.config/opencode/opencode.jsonc` 中自行引用**已构建的插件入口文件**，不要直接把仓库根目录写成 `file:/absolute/path/to/Opencode-for-CTF`。后者可能让宿主尝试执行依赖安装，并在某些环境里触发 `@opencode-ai/plugin@local` 解析失败。

请把路径换成你本机的绝对路径（先执行 `npm run build:plugin`）：

```jsonc
{
  "plugin": ["file:/absolute/path/to/Opencode-for-CTF/dist/plugin/index.js"],
  "default_agent": "ctf-fast",
  "skills": {
    "paths": ["/absolute/path/to/Opencode-for-CTF/skills"],
  },
  "instructions": [
    "/absolute/path/to/Opencode-for-CTF/rules/zh-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/en-solve-rules.md",
    "/absolute/path/to/Opencode-for-CTF/rules/agent-equipment.md",
  ],
}
```

> 手动模式没有 manifest / upgrade / 安全卸载。优先使用 `npm run ctf:install`。

旧版 `npm run setup`（由 `.env` 生成 `opencode.json`）仅作兼容保留。

## Agent 一览

| Agent                                                              | 类型         | 用途                                                                                    |
| ------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------- |
| `ctf-fast`                                                         | **主 agent** | 轻量快速解题 — 直觉优先、最小工具依赖                                                   |
| `ctf-expert`                                                       | **主 agent** | 证据驱动 — 侦查→分析→路线验证→迭代                                                      |
| `researcher`                                                       | 支持主 agent | 手动赛后复盘、lessons/retros 沉淀与本地 `rag/knowledge` RAG 导入维护（非 CTF 解题车道） |
| `ctf-web` / `ctf-pwn` / `ctf-rev` / `ctf-crypto` / `ctf-forensics` / `ctf-misc` / `ctf-aisec` | 子 agent     | 题型 playbook / family overlay；ctf-aisec 专注 AI 安全 CTF                         |
| `ctf-scout` / `ctf-librarian` / `ctf-oracle`                       | 子 agent     | 侦察 / 知识库 / 模式推断                                                                |

### 选择指南

| 场景                  | 推荐入口      |
| --------------------- | ------------- |
| 默认、不确定题型      | `/ctf`        |
| 快速尝试、简单题      | `/ctf-fast`   |
| 复杂逆向 / 二进制利用 | `/ctf-expert` |
| 多步骤 Web 链         | `/ctf-expert` |
| 多次尝试仍未解出      | `/ctf-expert` |

## 使用方式

```text
/ctf ./challenge
/help
/ctf-fast ./challenge
/ctf-expert ./challenge
/ctf-web http://127.0.0.1:8000
/ctf-pwn ./chall --remote 127.0.0.1:31337
/ctf-rev ./crackme
/ctf-crypto ./challenge.py
/ctf-forensics ./artifact.pcap
```

> Historical micro-commands are no longer installed as slash commands. Use `/ctf`, `/ctf-expert`, tools, and skills for advanced flows.

### ctf-expert 工作流

`ctf-expert` 是 Team Mode 编排者：并发调度 subagent，自己维护策略与 **Evidence.md**（工具 `ctf-evidence-board`）。

```mermaid
graph TD
    A[① 侦查 并发 workers] --> B[② 分析 制定恰好 3 条路线]
    B --> C[③ 验证 独立路线可并发]
    C --> D{④ 成功?}
    D -->|找到 Flag| E[✓ 直接返回 Flag]
    D -->|全部失败| F[⑤ 记录证据 next-round]
    F --> B
```

- 路线四态：`untested` | `blocked` | `dead` | `live`（**blocked ≠ dead**）
- 拿到 flag **直接返回**，不强制写 flag 文件
- 动态 MCP：subagent `ctf-dynamic-mcp-advisor request` → expert `ctf-mcp-control approve/deny`
- `ctf-fast` 仅轻量工具白名单；难题请 `/ctf-expert`

### Team Mode

`ctf-expert` 是唯一允许控制并发 Team Mode 的 Agent：

- `ctf-team-dispatch` — 启动 2–8 个独立子会话
- `ctf-team-status` / `ctf-team-collect` / `ctf-team-cancel` / `ctf-team-close` / `ctf-team-recover` / `ctf-team-adopt`

`ctf-team-adopt` 仅用于原父会话消失后的显式接管：必须指定 runID，且所有 worker 已终态；原父会话仍存在或存在 `cancel_failed` 时会 fail-closed。

worker 只返回证据，不应直接写 `notes.md`、`.ctf-state.json`、`.ctf-team.json` 或 `agent_flag.txt`；其中 `notes.md` 仅作迁移/导出，不是 canonical state。

## 仓库结构

```text
Opencode-for-CTF/
├── INSTALL.md             # 安装与升级指南
├── LICENSE                # MIT
├── SECURITY.md            # 安全策略与授权范围
├── CHANGELOG.md
├── CONTRIBUTING.md
├── opencode-for-ctf.example.jsonc
├── CTF_WORKSPACE_OPENCODE_TEMPLATE.jsonc
├── agents/                # Agent 定义
├── commands/              # Slash 命令
├── skills/                # CTF 技能
├── tools/                 # 工具定义
├── src/                   # 插件运行时
├── packages/              # ctf-core / adapter 等
├── scripts/               # install / CLI / release-check
├── rules/                 # 安全与解题规则
├── rag/                   # local RAG: knowledge indexes, lessons, optional source mirrors
├── docker/                # pwn/rev 多架构镜像
├── runtime/               # 运行时辅助
└── test/                  # Vitest
```

## 开发与发布检查

```bash
npm install
npm run check          # tsc + content validate + vitest
npm run build:plugin
npm run release:check
# 或
npm run pack:check     # build + release-check + npm pack --dry-run
```

公开前自检清单见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。贡献流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。路线图见 [ROADMAP.md](./ROADMAP.md)。

## 安全边界

- 本配置**不是**完整沙箱。未知二进制、恶意文档和可疑样本必须在隔离环境中运行。
- 本地文件工具默认只能访问当前项目、OpenCode worktree 和 `CTF_ALLOWED_ROOTS`。
- `.env`、SSH/GPG、私钥以及云凭据路径会被拒绝。
- 私网 / 链路本地 Web 目标必须显式加入 `CTF_ALLOWED_HOSTS`，且仍须在授权范围内。
- 所有 MCP 默认禁用；检查命令、路径、权限和数据流向后再启用。
- 漏洞请按 [SECURITY.md](./SECURITY.md) 私下报告，不要公开提 issue。

## 第三方

外部 skill 与衍生 pattern 的归属见 [`third_party/NOTICE.md`](./third_party/NOTICE.md)。

## License

[MIT](./LICENSE)
