# Opencode for CTF

一个面向 **OpenCode** 的 **CTF 自动化解题 Agent 配置仓库**。

它不是单个 prompt，也不是一组零散脚本，而是一套围绕 **agents / commands / skills / tools / benchmarks** 组织起来的工程化配置，用来把 CTF 解题流程结构化、可复用化、可扩展化。

## Features

- **多题型支持**：Web / Pwn / Rev / Crypto / Forensics / Misc
- **自动路由**：可先做低成本 triage，再分流到对应题型 agent
- **结构化工作流**：强调 recon、hypothesis、verification、closure
- **工具化能力**：内置文件 triage、flag grep、RSA 分析、Web probe、Java map 等工具
- **可扩展**：便于继续增加 skills、commands、tools、benchmarks
- **适合长期迭代**：保留 lesson / retro / benchmark 方向，适合持续打磨 agent

## 适合谁

适合这些用户：

- 想把 OpenCode 用于 CTF 自动化的人
- 想把 prompt 升级成工程化 agent 配置的人
- 想统一管理多题型工作流的人
- 想继续扩展 MCP、知识库、专项 skill 的人

## 仓库结构

```text
Opencode-for-CTF/
├─ opencode.jsonc                # 主配置文件（公开模板）
├─ AGENTS.md                     # 全局运行规则与安全边界
├─ .env.example                  # 用户自行配置的环境变量示例
├─ requirements.txt              # Python 依赖
├─ package.json                  # Node/TypeScript 依赖与脚本
│
├─ .opencode/
│  ├─ commands/                  # Slash commands
│  └─ tools/                     # 自定义工具
│
├─ skills/                       # CTF 技能库
├─ templates/                    # solve / exploit 模板
├─ benchmarks/                   # 行为基准与回归材料
├─ lessons/                      # 经验沉淀
├─ retros/                       # 复盘记录
├─ patches/                      # 配置演进记录
└─ scripts/                      # 校验脚本
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
```

### 2. 安装依赖

```bash
npm install
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. 复制到 OpenCode 配置目录

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode"
Copy-Item .\opencode.jsonc "$env:USERPROFILE\.config\opencode\opencode.jsonc" -Force
Copy-Item .\AGENTS.md "$env:USERPROFILE\.config\opencode\AGENTS.md" -Force
Copy-Item .\.opencode "$env:USERPROFILE\.config\opencode\.opencode" -Recurse -Force
Copy-Item .\skills "$env:USERPROFILE\.config\opencode\skills" -Recurse -Force
Copy-Item .\templates "$env:USERPROFILE\.config\opencode\templates" -Recurse -Force
```

### 4. 配置你自己的环境

本仓库**不包含作者个人 provider / model 配置**。你需要自行配置：

- 你自己的 provider / model
- API keys / tokens
- `CTF_WORKSPACE`
- 本地工具路径
- 可选 MCP 服务

请参考：

- `.env.example`
- `opencode.jsonc`

## 使用方式

推荐入口：

```text
/ctf ./challenge
/ctf-web http://127.0.0.1:8000
/ctf-pwn ./chall --remote 127.0.0.1:31337
/ctf-rev ./crackme
/ctf-crypto ./challenge.py
/ctf-forensics ./artifact.pcap
```

建议习惯：

1. 未知题先走 `/ctf`
2. 明确题型直接走对应 command
3. 保留 `notes.md`
4. 产出 `solve.py` / `exploit.py` / `solve.js` 等复现脚本
5. 只在确认后写入 `agent_flag.txt`

## 主要组成

### Agents

按题型和阶段分工，例如：

- `ctf-router`
- `ctf-web`
- `ctf-pwn`
- `ctf-rev`
- `ctf-crypto`
- `ctf-forensics`
- `ctf-misc`

### Commands

统一入口，减少每次手工组织上下文，例如：

- `/ctf`
- `/ctf-web`
- `/ctf-pwn`
- `/ctf-rev`
- `/ctf-crypto`
- `/ctf-forensics`
- `/ctf-misc`

### Skills

沉淀题型方法论与专项能力，例如：

- Web recon / attack queue / JWT / IDOR / SSTI / SSRF / Upload / XSS
- Pwn workflow / references
- Crypto RSA references
- Java Web 分析

### Tools

内置高频辅助工具，例如：

- `ctf-file-triage`
- `ctf-flag-grep`
- `ctf-rsa-probe`
- `ctf-web-probe`
- `ctf-java-map`
- `ctf-api-map`
- `ctf-file-write-matrix`
- `ctf-web-pattern-search`

## 需要用户自行配置的内容

公开仓库只提供框架和模板，不绑定个人环境。你需要按自己机器修改：

### 模型与 Provider

- 你实际可用的 provider
- 模型名称与路由方式
- 大模型 / 小模型分工
- API key 注入方式

### 工作目录

- `CTF_WORKSPACE`
- 外部目录访问权限
- filesystem MCP 根目录

### 本地工具路径

- `PUPPETEER_EXECUTABLE_PATH`
- `GHIDRA_INSTALL_DIR`
- `IDA_PATH`
- `SECURITY_MCP_WRAPPERS`
- `VMPROTECT_MCP`
- 其他你自己的本地工具路径

### 可选增强

- AnySearch
- 浏览器自动化 MCP
- 文档转换 MCP
- 本地知识库 / 自建 MCP
- Reverse / Forensics 专项工具链

## 常用校验命令

```bash
npm run check
npm run list
npm run tools:verify
```

## 推荐外部工具

不是全部必需，但会明显提升体验：

- Node.js
- Python 3.11+
- Git
- OpenCode
- Chrome / Chromium
- Docker / Docker Compose
- gdb / checksec / ROPgadget
- Ghidra / JADX / Radare2 / Frida
- SageMath
- binwalk / exiftool / tshark / yara / volatility

## 安全边界

本仓库仅面向：

- 授权 CTF
- 本地靶场
- benchmark
- 明确授权的实验环境

不要将其用于未授权目标。

另外，这套配置不是沙箱。对未知二进制、恶意文档、可疑样本，请在隔离环境中运行。

## License

本项目采用 [MIT License](./LICENSE)。

## 建议阅读顺序

1. `README.md`
2. `AGENTS.md`
3. `opencode.jsonc`
4. `.opencode/commands/`
5. `skills/`
6. `.opencode/tools/`
7. `benchmarks/`
