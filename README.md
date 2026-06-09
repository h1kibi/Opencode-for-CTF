# Opencode for CTF

> 一个面向 **OpenCode** 的 **CTF 自动化解题 Agent 配置集合**。
>
> 目标不是做一个“万能一键梭哈”的提示词仓库，而是提供一套 **可维护、可扩展、可审计、可复用** 的 CTF 自动化工作流：通过 **agents + commands + skills + tools + benchmarks + lessons** 的组合，把不同题型的解题过程结构化。

## 项目定位

本仓库提供的是一套围绕 OpenCode 组织起来的 CTF 自动化配置，适用于：

- Web
- Pwn
- Reverse
- Crypto
- Forensics
- Misc / 路由分发

它的核心思路不是只靠一个大 prompt 解决所有问题，而是把能力分层：

- **Agent**：负责不同阶段、不同题型、不同深度的决策与执行
- **Command**：提供标准化入口，减少每次手工组织上下文
- **Skill**：沉淀某类题型的方法论、检查顺序、约束和输出规范
- **Tool**：把高频、低风险、可重复的动作工具化
- **Benchmark / Lessons / Retros**：让配置不仅能“做题”，还能够“迭代”

如果你希望把 OpenCode 打造成一个更稳定的 CTF 协作代理，而不是临时拼 prompt，这个仓库就是为此准备的。

---

## 设计目标

这个配置主要围绕以下目标构建：

1. **自动路由**：先做低成本分流，再进入对应题型 agent
2. **结构化解题**：先 triage，再 hypothesis，再验证，再收敛
3. **减少无效搜索**：优先本地证据、源码、样本、行为差异，而不是盲猜
4. **鼓励复盘沉淀**：通过 lessons / retros / benchmarks 提高后续题目的稳定性
5. **保持安全边界**：默认只面向授权的 CTF / 本地靶场 / benchmark 环境
6. **易于二次定制**：用户可以自行替换 provider、模型、MCP、工作目录、知识库路径

---

## 仓库结构

```text
Opencode-for-CTF/
├─ opencode.jsonc                # 主配置文件（公开版模板）
├─ AGENTS.md                     # 全局运行原则 / 安全边界 / 输出纪律
├─ .env.example                  # 用户需要自行配置的环境变量示例
├─ requirements.txt              # Python 依赖（仓库脚本 / 常见增强组件）
├─ requirements-docs.txt         # 文档/附加能力依赖
├─ package.json                  # Node/TypeScript 依赖与校验脚本
│
├─ .opencode/
│  ├─ commands/                  # Slash commands 入口
│  └─ tools/                     # 自定义 OpenCode 工具
│
├─ skills/                       # 题型与子能力技能库
├─ templates/                    # solve.py / exploit.py 等模板
├─ benchmarks/                   # 行为基准，用于回归检查
├─ lessons/                      # 经验教训沉淀
├─ retros/                       # 解题复盘
├─ patches/                      # 配置演进记录 / 补丁笔记
├─ scripts/                      # 校验与辅助脚本
└─ third_party/                  # 第三方参考资源与声明
```

---

## 整体框架

这套配置可以理解成一个分层式 CTF 自动化框架：

### 1. 配置层：`opencode.jsonc`

负责定义：

- 默认 agent
- 权限模型
- MCP 服务
- 插件
- 输出压缩策略
- 技能路径
- 工具行为边界

公开版会尽量保留框架本身，但不会强绑定作者的私有 provider、私有路径、个人知识库部署方式。

### 2. Agent 层

Agent 负责“谁来做”和“做到什么深度”。

典型职责包括：

- **ctf-router / ctf-fast**：快速分流、低成本分类、初步 triage
- **ctf-rigorous**：更严格的结构化 solve 流程
- **ctf-web / ctf-pwn / ctf-rev / ctf-crypto / ctf-forensics / ctf-misc**：按题型做深入执行
- **daily**：日常开发模式，与 CTF 模式隔离
- **librarian / oracle / verifier / scout / retro**：辅助分析、知识检索、验证、复盘等角色

这比单一 agent 的好处是：

- 不同题型可以有不同权限和方法论
- 路由和深度 solve 可以拆开
- 更适合后期继续加子 agent
- 更容易做 benchmark 和回归测试

### 3. Command 层：`.opencode/commands/`

Slash command 用于提供稳定入口，例如：

- `/ctf`
- `/ctf-web`
- `/ctf-pwn`
- `/ctf-rev`
- `/ctf-crypto`
- `/ctf-forensics`
- `/ctf-misc`

它们的意义不是简单别名，而是把“应该先做什么、调用哪个 agent、预期输出什么”固定下来，减少每次重新组织 prompt 的成本。

### 4. Skill 层：`skills/`

Skill 是方法论沉淀层。题型技能之外，还包含很多更细分的能力技能，例如：

- Web Recon
- Attack Queue
- SQLi / SSTI / SSRF / LFI / Upload / JWT / IDOR / XSS
- Java Web 分析
- Pwn references
- Crypto RSA references

Skill 的价值在于：

- 降低 agent 在通用推理上的浪费
- 强化固定检查顺序
- 把经验从 prompt 迁移成可复用资产
- 便于逐步积累子领域打法

### 5. Tool 层：`.opencode/tools/`

这里放的是高频、可程序化的微工具。当前仓库中包含例如：

- `ctf-file-triage`
- `ctf-flag-grep`
- `ctf-rsa-probe`
- `ctf-web-probe`
- `ctf-java-map`
- `ctf-api-map`
- `ctf-file-write-matrix`
- `ctf-web-pattern-search`
- `doc-read`

这些工具的作用是把“常见第一步”标准化，例如：

- 文件到底是什么
- 目录里有没有 flag 形态字符串
- 一组 RSA 参数有没有明显弱点
- 一个 Web URL 的最小化低风险探测结果
- Java Web 项目的路由与 sink 是否能快速成图

### 6. Benchmark / Lessons / Retros 层

这部分是整个配置最有价值的长期资产之一。

- **benchmarks/**：验证 agent 是否保持预期行为
- **lessons/**：沉淀“不要再犯的错误”和“应该优先做什么”
- **retros/**：题后复盘，可反馈回技能与 agent 设计

也就是说，这个仓库不只是“配置”，而是一个可持续演进的 CTF agent 工程骨架。

---

## 功能特点

### 1. 多题型覆盖

支持 Web / Pwn / Rev / Crypto / Forensics / Misc 的分流与处理。

### 2. 先 triage 再深挖

不是看到一个点就立刻重拳出击，而是先做：

- 文件/服务识别
- 目标分类
- 证据整理
- attack queue 排序
- 再进入 exploit / solve

### 3. 路由与求解分离

`/ctf` 这种总入口更像一个 orchestrator，不直接承担所有 solve 细节。

### 4. 强调低风险验证

特别是在 Web 和复杂题中，优先：

- 低成本确认
- 单变量探测
- canary
- 差异分析
- 最短闭环

### 5. 方便接入本地知识库

作者原始私有配置中支持本地知识库、检索增强、外部 MCP 和更复杂的 agent 协作。开源版不会绑定这些私有设施，但保留了清晰的扩展入口，方便你自己接入：

- AnySearch
- 本地 SecKB / CVEKB
- 浏览器自动化
- Java / Reverse / 文档分析相关 MCP

### 6. 更像工程，而不是 prompt 收藏夹

这里的重点是：

- 结构化目录
- 权限约束
- 可测试工具
- benchmark
- 文档化
- 易维护性

---

## 相比常见 CTF Agent 配置的优势

### 优势 1：分层明确

很多配置把所有东西塞进一个 prompt 或一个 agent 里，短期可用，长期难维护。这个仓库把：

- 路由
- 方法论
- 工具
- benchmark
- 复盘

拆成了清晰的层。

### 优势 2：可扩展性强

你可以非常自然地继续加：

- 新 agent
- 新 command
- 新题型 skill
- 新工具
- 新 benchmark

而不需要推倒重来。

### 优势 3：更适合长期迭代

通过 lessons / retros / benchmark，可以把“做过的坑”转化成未来 agent 的默认行为约束。

### 优势 4：更适合团队共享

开源后，别人不需要复制作者的本地路径和 provider，即可理解这套系统的结构，再按自己环境完成替换。

### 优势 5：注重实际解题流程

很多地方不是单纯“让模型想”，而是把：

- triage
- recon
- source-first
- exploit chain
- verification
- closure

这些真实做题流程显式写进配置。

---

## 默认使用方式

### 快速入口

```text
/ctf ./challenge
/ctf-web http://127.0.0.1:8000
/ctf-pwn ./chall --remote 127.0.0.1:31337
/ctf-rev ./crackme
/ctf-crypto ./challenge.py
/ctf-forensics ./artifact.pcap
```

### 推荐使用习惯

1. 未知题先走 `/ctf`
2. 明确题型直接走对应 command
3. 保留 `notes.md`
4. 产出 `solve.py` / `exploit.py` / `solve.js` 等可复现脚本
5. 只有确认 flag 后再写 `agent_flag.txt`

---

## 安装与部署

> 本仓库不会修改你的本地配置；你应先在自己的环境中复制并按需调整。

### 1. 克隆仓库

```bash
git clone https://github.com/h1kibi/Opencode-for-CTF.git
cd Opencode-for-CTF
```

### 2. 安装 Node 依赖

```bash
npm install
```

### 3. 安装 Python 依赖

建议使用虚拟环境：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 4. 复制到 OpenCode 配置目录

Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode"
Copy-Item .\opencode.jsonc "$env:USERPROFILE\.config\opencode\opencode.jsonc" -Force
Copy-Item .\AGENTS.md "$env:USERPROFILE\.config\opencode\AGENTS.md" -Force
Copy-Item .\.opencode "$env:USERPROFILE\.config\opencode\.opencode" -Recurse -Force
Copy-Item .\skills "$env:USERPROFILE\.config\opencode\skills" -Recurse -Force
Copy-Item .\templates "$env:USERPROFILE\.config\opencode\templates" -Recurse -Force
```

如果你已经有自己的 OpenCode 配置，建议：

- 先备份原配置
- 只复制你需要的 agents / commands / skills / tools
- 再根据自己的模型与 MCP 环境合并 `opencode.jsonc`

---

## 需要用户自行配置的内容

本仓库是公开版模板，不应直接绑定作者个人环境。以下内容你应该根据自己的机器单独配置：

### 1. 模型与 Provider

你可以删除作者个人偏好的 provider/model，或完全替换成自己的：

- OpenAI-compatible provider
- Claude / Gemini / DeepSeek / OpenRouter / 自建网关
- 小模型 / 大模型分工

建议把这些配置保留在你自己的私有版本中，或改成环境变量驱动。

### 2. 工作目录 / 挑战目录

例如：

- `CTF_WORKSPACE`
- 外部目录访问权限
- filesystem MCP 根目录

这些必须改成你自己的路径，不要照搬作者机器路径。

### 3. 本地工具路径

例如：

- `PUPPETEER_EXECUTABLE_PATH`
- `GHIDRA_INSTALL_DIR`
- `IDA_PATH`
- `SECURITY_MCP_WRAPPERS`
- `VMPROTECT_MCP`

### 4. 私有知识库 / 本地增强服务

如果你自己也有本地知识库，可以自行扩展，例如：

- AnySearch API Key
- 本地知识库服务路径
- 自建 MCP 服务
- 浏览器自动化 / 文档解析服务

### 5. API Keys / Tokens

所有密钥都应该使用：

- 环境变量
- 私有本地配置
- 不提交到 Git 的私有文件

不要直接写进公开仓库。

---

## `.env.example` 的作用

本仓库提供 `.env.example` 作为占位示例。你应该：

1. 复制一份为自己的私有配置来源
2. 改成你机器实际可用的路径
3. 不要把真实密钥提交回仓库

---

## 依赖说明

### Node / TypeScript

用于：

- 自定义 OpenCode 工具
- 仓库校验脚本
- benchmark / 工具验证

安装：

```bash
npm install
```

### Python

用于：

- 部分辅助脚本
- 文档抽取
- 可选分析工作流
- 你后续自己扩展的 solve / exploit 脚本

安装：

```bash
pip install -r requirements.txt
```

### 推荐但需要自行安装的外部工具

以下很多是“可选增强”，不是仓库运行的硬性前置，但会显著提升不同题型体验：

#### 通用

- Git
- Node.js
- Python 3.11+
- OpenCode
- uv / uvx（可选）

#### Web

- Chrome / Chromium
- Playwright / Puppeteer 相关环境
- Docker / Docker Compose
- curl
- ffuf / gobuster / feroxbuster / wfuzz（按需）
- sqlmap（按需）

#### Pwn

- gdb
- pwndbg / gef（按需）
- checksec
- readelf / objdump / strings
- ROPgadget
- one_gadget
- patchelf（Linux 环境更常用）

#### Rev

- Ghidra
- IDA Pro（可选）
- JADX
- Radare2
- Frida

#### Crypto

- SageMath（按需）
- OpenSSL

#### Forensics

- binwalk
- exiftool
- tshark / Wireshark
- yara
- volatility
- 7z / unzip / tar

---

## 校验命令

```bash
npm run check
npm run list
npm run tools:verify
```

如果你引入了新的 tools / skills / commands，建议每次都跑一遍。

---

## 开源版与作者私有版的区别

作者自己的本地配置通常会比公开仓库更激进，可能包括：

- 更完整的 provider 池
- 私有模型网关
- 本地知识库接入
- 私有 MCP 服务
- 本机绝对路径
- 个人工作目录
- 更复杂的多 agent 协同

公开版的目标不是 1:1 暴露作者私人环境，而是保留：

- **体系结构**
- **方法论**
- **可迁移能力**
- **可二次开发的骨架**

这样别人克隆后，既能理解你的 agent 设计，也能按自己的环境快速落地。

---

## 适合谁使用

适合以下用户：

- 想把 OpenCode 用于 CTF 自动化的人
- 想把“prompt”升级为“工程化 agent 配置”的人
- 想做多题型统一工作流的人
- 想积累 benchmark / lesson / retro 的人
- 想在自己环境里继续扩展 MCP / 本地知识库 / 专项 skill 的人

---

## 安全与使用边界

本仓库仅面向：

- 授权 CTF
- 本地靶场
- benchmark
- 明确授权的实验环境

不要将其用于未授权目标。

另外，这套配置也不是沙箱。对于未知样本、二进制、恶意文档、可疑附件，请在隔离环境中运行。

---

## 后续可扩展方向

如果你基于这个仓库继续演进，比较自然的方向包括：

- 增加更多 category-specific benchmark
- 增加 hard 模式 agent 的闭环控制
- 接入本地 lesson / pattern / knowledge 检索
- 为 Web / Pwn / Rev 分别增加更细粒度子 agent
- 加入自动化 retro / lesson 提取流程
- 把更多高频手工检查收敛成工具

---

## 致谢

仓库中部分思路、结构、参考资料和外部组件依赖来自 OpenCode 生态、MCP 工具生态以及第三方资料，具体见仓库内相应目录和声明文件。

---

如果你是第一次接触这个项目，建议先按下面顺序阅读：

1. `README.md`
2. `AGENTS.md`
3. `opencode.jsonc`
4. `.opencode/commands/`
5. `skills/`
6. `.opencode/tools/`
7. `benchmarks/`
