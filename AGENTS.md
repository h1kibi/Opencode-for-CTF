# opencode-for-ctf — CTF Agent Plugin for Opencode

将你的 opencode 配置中的 CTF 部分分离为独立插件，支持多 agent 编排、证据驱动解题、知识库集成和运行时 hooks。

## 结构

```
opencode-for-ctf/
├── src/               # 插件运行时 (continuation, team-mode, skill MCP lifecycle)
├── agents/            # CTF agent 定义 (master, fast, web, pwn, rev, crypto, ...)
├── skills/            # CTF skill 定义 (56+ 技能)
├── tools/             # CTF 工具 (140+ 工具)
├── commands/          # CTF 命令 (129+ 命令)
├── scripts/           # CTF 脚本 (检查、诊断、状态管理)
├── knowledge/         # 知识库 (lessons, pattern-cards, pwn, rev)
├── lessons/           # 结构化 lessons (closure, failure, anti-pattern)
├── templates/         # CTF 解题模板 (solve_*.py, Dockerfile.*, state files)
├── rules/             # 安全/CTF 规则
├── docs/              # CTF 文档
├── patches/           # CTF 效率迭代记录
├── packages/          # 子包 (ctf-core, ctf-notes-core, ctf-rules-engine)
├── skills-external/   # 外部 CTF skills (ljagiello/ctf-skills 镜像)
├── runtime/           # 运行时环境辅助脚本 (win/wsl env)
├── benchmarks/        # CTF benchmark
├── opencode.jsonc     # 参考配置
└── package.json       # 插件入口
```

## 使用方式

1. 在 `~/.config/opencode/opencode.jsonc` 中引用插件：
   ```jsonc
   {
     "plugin": ["file:C:\\Projects\\Agent-projects\\Opencode-for-CTF"],
      "default_agent": "ctf-fast",   // 可选: ctf-fast (快速) 或 ctf-expert (全面)
     "skills": {
       "paths": [
         "C:\\Projects\\Agent-projects\\Opencode-for-CTF\\skills",
         "C:\\Projects\\Agent-projects\\Opencode-for-CTF\\skills-external\\ctf-skills"
       ]
     },
     "instructions": [
       "C:\\Projects\\Agent-projects\\Opencode-for-CTF\\rules-cn.md",
       "C:\\Projects\\Agent-projects\\Opencode-for-CTF\\ctf-rules.md"
     ]
   }
   ```

 2. 或直接使用插件自带的 `opencode.json`（需调整路径）。

## Agent 选择指南

根据题目难度选择合适的 agent：

- **简单/中等题目** → 使用 `ctf-fast`：直觉解题、快速出 flag
- **复杂/困难题目** → 使用 `ctf-expert`：证据驱动、系统迭代

## Agent 一览

| Agent | 类型 | 用途 |
|-------|------|------|
| `ctf-fast` | **主 agent** | 轻量快速解题 — 直觉优先、最小工具依赖、快速验证 |
| `ctf-expert` | **主 agent** | 全面证据驱动解题 — 侦查→分析→路线验证→迭代循环，维护 Evidence.md，三条路线规划 |
| `ctf-web` | 子 agent | Web 漏洞利用 |
| `ctf-pwn` | 子 agent | 二进制漏洞利用 |
| `ctf-rev` | 子 agent | 逆向工程 |
| `ctf-crypto` | 子 agent | 密码学攻击 |
| `ctf-forensics` | 子 agent | 取证分析 |
| `ctf-misc` | 子 agent | 杂项/非常规挑战 |
| `ctf-scout` | 子 agent | 信息搜集 |
| `ctf-librarian` | 子 agent | 知识库查询 |
| `ctf-oracle` | 子 agent | 模式匹配/知识推断 |
| `ctf-verifier` | 子 agent | 验证/质量门 |
| `ctf-web` | 子 agent | Web 漏洞利用 |
| `ctf-pwn` | 子 agent | 二进制漏洞利用 |
| `ctf-rev` | 子 agent | 逆向工程 |
| `ctf-crypto` | 子 agent | 密码学攻击 |
| `ctf-forensics` | 子 agent | 取证分析 |
| `ctf-misc` | 子 agent | 杂项/非常规挑战 |
| `ctf-scout` | 子 agent | 信息搜集 |
| `ctf-librarian` | 子 agent | 知识库查询 |
| `ctf-oracle` | 子 agent | 模式匹配/知识推断 |
| `ctf-verifier` | 子 agent | 验证/质量门 |

## 环境变量

| 变量 | 用途 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `GITHUB_PAT` | GitHub Personal Access Token |
| `SECKB_PYTHON` | SecKB Python 解释器路径 |
| `SECKB_MCP_SERVER` | SecKB MCP 服务端脚本路径 |
| `CVEKB_MCP_SERVER` | CVEKB MCP 服务端脚本路径 |
| `SECKB_ROOT` | SecKB 根目录 |
| `SECKB_CONFIG` | SecKB 配置文件路径 |
| `CVEKB_ROOT` | CVEKB 根目录 |
| `GHIDRA_INSTALL_DIR` | Ghidra 安装目录 |
| `JINA_API_KEY` | Jina AI API Key (搜索/抓取) |
| `FIRECRAWL_API_KEY` | Firecrawl API Key |
| `TAVILY_API_KEY` | Tavily API Key |
| `BRAVE_API_KEY` | Brave Search API Key |
| `ANYSEARCH_API_KEY` | AnySearch API Key |

## 注意事项

- 多数 `provider` 配置需在用户 `opencode.jsonc` 中自行添加 API Key
- 逆向工具 (IDA Pro, Ghidra/ReVa, Flutter AOT) 需额外安装
- 知识库 (SecKB/CVEKB) 需单独部署
