# opencode-for-ctf 插件评估与改进方案

> 评估对象：`C:\Projects\Agent-projects\Opencode-for-CTF` 当前工作树（2026-08-01）。
>
> 结论先行：这是一个架构完整、工程野心很强的 CTF Agent 编排插件，已经明显超过“几个提示词加工具包装器”的水平；但从竞赛获奖角度，它目前仍更像“有流程纪律、证据意识和大量工具 facade 的实验性平台”，而不是已经通过真实题目回归、能够稳定从附件/服务闭环得到并验证 flag 的自动解题系统。下一阶段的核心不应继续单纯增加工具数量，而应把**真实成功率、独立 flag 验证、可复现 exploit、运行时可靠性和安全隔离**建立起来。

## 1. 评估范围与方法

本评估覆盖：

- `/ctf`、`ctf-fast`、`ctf-expert` 的产品入口和升级路径；
- Web、Pwn、Rev、Crypto、Forensics、Misc，以及 Android/Java/Godot 扩展能力；
- Agent、skills、tool packs、工具加载与工具契约；
- Team Mode、事件回调、恢复、取消与父会话通知；
- 动态 MCP、Skill MCP lease、请求审批与清理；
- case state、Evidence Board、事件日志与 Markdown 投影；
- 路由、RAG、权限 hook、路径/网络策略、Pwn 容器；
- 测试、coverage、benchmark、发布检查和当前工作树变更。

采用了静态代码审查、目录/工具数量盘点、现有测试和发布脚本执行结果复核。没有在真实 CTF 平台上提交攻击，也没有把“模型生成了 exploit 文本”当作成功。因而本文对解题能力的判断是**工程和闭环能力评估，不是假称真实获奖率**。

## 2. 总体结论与评分

下表是“当前可见工程能力”的相对评分，不是基于大规模题库统计出的胜率：

| 维度                 |  评分 | 判断                                                                 |
| -------------------- | ----: | -------------------------------------------------------------------- |
| 产品入口与使用流程   |   4/5 | `/ctf` 自动路由、fast/expert、resume 形成了清晰入口。                |
| Agent 编排与证据纪律 |   4/5 | R1/R2/R3、handoff、Evidence.md、blocked/dead 区分是明显优势。        |
| 工具与分类覆盖       |   3/5 | 数量大、Pwn/核心/Web 较丰富，但数量与闭环质量不等价。                |
| Web 解题准备度       |   3/5 | 侦察、source map、状态机和计划工具较好，复杂漏洞闭环仍不足。         |
| Pwn 解题准备度       |   3/5 | 基础设施丰富，真正的 exploit oracle、环境契约和隔离仍不够强。        |
| Rev 解题准备度       |   3/5 | ELF/PE/Ghidra/动态 dump 方向较全，依赖外部环境和真实样本验证。       |
| Crypto 解题准备度    |   2/5 | 当前主要是识别/参数盘点/RSA 提示，缺少可执行攻击族。                 |
| Forensics 解题准备度 |   3/5 | PCAP、媒体、stego、artifact 覆盖存在，但 fallback 与大文件回归不足。 |
| Misc 解题准备度      |   2/5 | 主要是分类转交，pyjail、约束、协议和非标准编码闭环明显薄。           |
| 状态与恢复可靠性     |   3/5 | atomic write、lock、repair 思路好，但状态模型分裂且校验不完整。      |
| 安全隔离             |   2/5 | 有 allowed roots、审批和容器意识，但自动 allow 与容器权限仍偏宽。    |
| Benchmark 有效性     |   2/5 | 当前检查偏文本行为，且空输出目录可能直接成功，不能证明拿 flag。      |
| 获奖准备度           | 2.5/5 | 具备成为强平台的骨架，当前最大缺口是实战回归和成功判定。             |

### 最重要的判断

1. **当前没有足够证据证明插件能稳定获得 flag。** 代码中大量能力是分析器、facade、计划器或外部命令包装器；这些都很有价值，但不等于 exploit 成功。
2. **Benchmark 是当前最危险的“虚假安全感”来源。** 如果没有独立 oracle、挑战 fixture 和可重放 solver，关键词检查只能验证模型会写流程术语。
3. **Crypto 与 Misc 是最明显的分类短板。** Pwn 工具数量最多，但仍需要用真实题目验证；新增工具不应掩盖闭环检测不足。
4. **运行时可靠性和安全策略必须优先于继续扩大工具面。** 工具加载失败被吞掉、权限前缀自动放行、Evidence Board 多文件非事务写入，都会导致“看起来可用、关键时刻失效”。

## 3. 已有优势：建议保留并继续强化

### 3.1 分层架构方向正确

`src/`、`agents/`、`skills/`、`tools/`、`rag/`、`benchmarks/`、`packages/` 之间已有明确分工，`ctf-core` 与 OpenCode adapter 也体现了产品层和领域层解耦的意识。这个方向比把所有逻辑塞入一个大 Agent prompt 更容易测试、替换和演进。

### 3.2 证据驱动流程是竞争优势

Evidence Board、`Evidence.md`、route states、R1/R2/R3、handoff、blocked 不等于 dead、flag stop condition 等设计，能够抑制 Agent 在 CTF 中常见的：

- 重复尝试同一个假设；
- 把错误输出当成 flag；
- 没有记录失败路径；
- 多个 worker 无边界并行、互相覆盖状态；
- 题目已经解决仍继续消耗时间。

这部分应保留，但要把“方法论约束”升级为 runtime invariant 和独立 oracle，而不能只靠 Agent 遵守提示词。

### 3.3 状态持久化已有工程基础

状态层已有 file lock、atomic update、revision、损坏 JSON 处理/repair 等意识；Team Mode 也有 job transition、取消、恢复和父会话通知。对 OpenCode 这类长时 Agent 运行环境而言，这些是必要基础。

### 3.4 跨平台和外部工具意识较好

Windows/PowerShell、WSL、Docker、ELF/PE、Android、Ghidra/IDA 等路径都被考虑到。对真实 CTF 而言，工具可得性经常比算法本身更先成为瓶颈，这种 doctor/fallback 方向值得持续投资。

## 4. 主要不足与代码证据

## 4.1 P0：无法证明真实解题成功

### 现象

当前 benchmark checker 主要检查 `Recon Map`、`Attack Queue`、`Primitive Ledger`、`handoff`、`notes.md`、工具名称等文本/过程信号。更严重的是，多个 checker 在找不到输出文件时执行：

```ts
if (outputFiles.length === 0) {
  console.log("No output files found (...)")
  process.exit(0)
}
```

已发现于 `scripts/check-web-benchmarks.ts`，其他分类 checker 有相同逻辑。

### 影响

- 没有 solver 输出仍可能显示成功；
- 没有挑战 fixture、没有 flag、没有复现脚本也能通过 CI；
- benchmark 会鼓励模型生成关键词，而不是完成攻击闭环；
- 不能比较不同版本对真实题目的提升。

### 改进

建立独立的 Challenge Regression Harness：

```text
fixture/
  challenge.yaml
  files/
  service/       # 可选，本地服务或容器
  oracle/        # 独立验证器，不加载 solver prompt
solver/
  solve.py 或 solve.ts
result/
  flag.txt
  evidence.json
```

每个 fixture 必须定义：

- challenge family、难度、依赖和网络需求；
- 启动/停止命令；
- flag oracle：精确 flag、签名验证、服务端 checker 或 hash；
- 允许的时间、内存、网络和工具预算；
- 预期 artifact 和可复现命令。

Checker 规则改为：

- fixture 缺失：本地开发输出 `SKIP`，CI 输出失败；
- solver 未运行：失败；
- flag 未经 oracle 验证：失败；
- 只出现 flag-like 字符串：不算成功；
- solver 产生的 `solve.py` 必须在干净环境中重复成功；
- 所有状态报告与工具输出保存为 artifact，便于回归分析。

### 验收标准

至少建立每类 10 个可公开分发的最小 fixture，第一阶段覆盖 Web SSRF/SQLi/JWT、Pwn ret2win/ret2libc/format string、Rev XOR/packed/PE、Crypto RSA/ECDSA/CBC、PCAP/stego、pyjail/编码链。CI 必须显示每个 fixture 的 `PASS/SKIP/FAIL`，禁止“空目录成功”。

## 4.2 P0：flag 成功判定过于启发式

`tools/pwn/ctf-pwn-runner.ts` 中的逻辑类似：

```ts
const localSuccess = flagDetected || (shellDetected && !crash && !timedOut)
```

这把“出现 flag-like 字符串”或“输出像 shell”作为成功信号。它不能证明：

- 目标服务确实被利用；
- 输出来自 challenge，而不是脚本日志、decoy 或环境变量；
- 获得的是正确 flag；
- exploit 在干净环境能重放。

### 改进

增加统一 `FlagOracle` 接口：

```ts
interface FlagOracle {
  kind: "exact" | "regex+signature" | "service-check" | "file-check" | "custom"
  verify(result: SolverResult, context: ChallengeContext): Promise<OracleResult>
}
```

工具结果必须区分：

```text
executed / crashed / timeout / primitive-confirmed /
interactive-shell / candidate-flag / oracle-verified / reproduced
```

`shellDetected` 只能是 evidence，不得升级为 `success`。Pwn runner、Web exploit、MCP 调用、命令行 solver 都复用同一 oracle。

## 4.3 P0：工具 import 失败被吞掉，readiness 可能是假绿色

`src/ctf-tools.ts` 在动态 import 失败时仅 `console.warn`，继续注册其它工具。这个容错本身是合理的，但目前没有把失败工具、原因、criticality 和 fallback 形成结构化 readiness。当前新增的 `src/plugin-health.ts` 主要是读取和汇总 health JSON，不能替代工具注册期的健康状态。

### 影响

- 插件可能显示“启动成功”，关键工具实际不可用；
- Agent 到中途才发现 Ghidra、Docker、pcap、PE 工具缺失；
- 无法区分工具未启用、导入失败、外部依赖缺失、权限拒绝；
- 不能根据 family 自动降级或更换路径。

### 改进

创建 `ToolLoadReport`：

```ts
{
  schemaVersion: 1,
  registered: [],
  deferred: [],
  failed: [{ name, path, stage, error, critical, fallback }],
  runtimeDependencies: [],
  generatedAt: "..."
}
```

核心工具 import 失败时：

- 当前 lane 若依赖它，readiness=`blocked`；
- 非关键工具允许 `degraded`，但必须在 `/ctf` 初始摘要中显示；
- 提供 `ctf-runtime-selftest` 一键检查；
- `ctf-tool-packs` 显示“存在/启用/注册/外部依赖可用”四种状态；
- 关键工具声明 fallback，例如 `ghidra -> rizin/objdump`，`tshark -> python scapy`。

## 4.4 P0：权限自动 allow 范围过宽

`src/plugin-support.ts` 的安全前缀列表包含 `python`、`node`、`npx` 等通用执行器。按字符串前缀自动 allow 无法判断真实 argv、cwd、写入范围、网络和副作用。`npx` 还可能下载并执行远程包。

此外，Pwn runbox 使用 Docker、RW mount、`SYS_PTRACE`、`seccomp=unconfined` 等高风险能力；即使这些能力对调试题目有用，也不应由宽泛前缀自动放行。

### 改进

将权限判定从：

```text
title/type + string startsWith(prefix)
```

改为结构化 policy：

```ts
{
  executable,
  argv,
  cwd,
  readRoots,
  writeRoots,
  network: "none" | "challenge-only" | "allowed-hosts" | "any",
  risk: "read" | "execute" | "network" | "debug" | "destructive"
}
```

默认策略：

- `python -c`、`node -e`、`npx`、shell wrapper：至少 ask；
- 只读 `file`、`strings`、`readelf`、`objdump`：可自动 allow，但仍限制 cwd/root；
- 网络请求：校验目标 host、redirect、DNS 解析和 request budget；
- Docker：默认无特权、去除不必要 capability、限制 CPU/内存/PIDs，默认关闭外网，仅挂载 challenge/work 子目录；
- `SYS_PTRACE`、`seccomp=unconfined`、宿主 RW mount：显式确认，并记录审计事件。

## 4.5 P0：Evidence Board 多文件写入不是事务

`tools/core/ctf-evidence-board.ts` 的 `persist()` 直接依次执行：

```ts
await writeFile(boardPath, ...)
await writeFile(mdPath, ...)
```

之后还会同步 case state 和追加事件。board JSON、`Evidence.md`、case.json、events.jsonl 不是同一事务；中途崩溃或并发写入会产生不一致。`loadBoard()` 也只是 `JSON.parse(raw) as EvidenceBoard`，缺少深层 runtime schema validation。

### 改进

- 选一个 canonical state，建议 board/case state 作为唯一事实源；
- `Evidence.md` 只作为可重建投影，不作为事实源；
- 所有 mutation 使用工作区级 lock、temp file + fsync + rename；
- board、case、event 使用 revision/correlation ID；
- 事件加入 sequence、writer、timestamp、checksum；
- 增加 `ctf-evidence-board verify` 和 `repair`；
- route 数量、状态转换、live 互斥等 invariant 在 reducer 中强制执行；
- flag 只有通过 oracle 才能触发 live/solved，不允许单纯手填字符串改变结论。

## 4.6 P1：路由仍主要依赖关键词，confidence 未校准

`packages/ctf-core/src/router.ts` 的 `CATEGORY_PATTERNS`、`scoreCategories()`、`pickMode()`、`confidenceFrom()` 是规则型路由。关键词适合快速初筛，但存在：

- 混合题误判；
- 无题面、只有附件时无法充分判断；
- `java`、`heap` 等单词对 expert/category 造成过强影响；
- `confidence` 是分数映射，不是真实概率；
- `alternates` 没有形成低成本并行验证和自动重路由。

### 改进

采用四层路由：

```text
题面文本抽取
  -> 文件树/魔数/MIME/ELF/PE/PCAP/ZIP 探测
  -> 服务、端口、协议和运行时探测
  -> Web/Pwn/Rev/Crypto/Forensics/Misc 并行 cheap probes
  -> 校准后的路由与动态重路由
```

每个 probe 必须有成本和失败上限。路由结果保存：

```text
primary family / alternates / evidence / confidence / probe cost / expiry
```

连续 N 次没有新增事实、工具失败达到阈值、或当前 family 的 capability readiness 不满足时，自动触发 alternate probe，而不是等待 Agent 自己喊 `ESCALATE`。

## 4.7 P1：fast -> expert 依赖文本协议，升级不是状态迁移

`ctf-fast` 的工具面较窄，这是控制噪声的好想法；问题是中等题可能在 fast lane 卡住。当前升级主要依赖模型输出 `ESCALATE: ctf-expert`，而不是运行时自动迁移。这样可能出现：

- 模型忘记升级；
- expert 需要用户重新输入命令；
- 已有 facts、失败尝试、工具输出没有完整移交；
- fast 与 expert 的权限/工具差异造成隐性重复工作。

### 改进

把 lane 升级实现为状态机：

```text
fast_active -> promotion_pending -> expert_active -> handoff_complete
```

自动升级触发器包括：

- 连续 3 次工具调用无新增事实；
- 同一 probe 重复 2 次以上；
- 分支/假设数量超过预算；
- 外部工具失败达到阈值；
- 需要重试、交互调试、动态 MCP 或写 exploit；
- route confidence 下降或出现新的强证据。

迁移包应包括 case id、route、facts、hypotheses、failed attempts、tool outputs 摘要、当前预算、待审批 MCP 和 Evidence Board revision。

## 4.8 P1：Tool pack 与 metadata 多处手工维护，容易漂移

目前存在 `CORE_EXACT`、各类 `*_HEAVY_EXACT`、prefix rules、fast allowlist、subagent allowlist 和 `src/tool-metadata.ts` 等多份集合。新工具加入或重命名时，容易出现：

- 工具文件存在但 pack 不可达；
- agent 文档声明可用但实际未注册；
- 工具属于错误 family/tier；
- 安全风险没有同步到 permission hook；
- doctor、pack、文档彼此矛盾。

### 改进

建立唯一 manifest：

```ts
type ToolManifest = {
  name: string
  family: CtfFamily[]
  pack: ToolPackId
  tier: "fast" | "expert" | "heavy"
  risk: "read" | "write" | "network" | "execute" | "debug" | "destructive"
  requiredCapabilities: string[]
  fallbacks: string[]
  critical?: boolean
  inputRoots?: "challenge" | "worktree" | "any-approved"
}
```

启动时由 manifest 生成 pack registry、agent surface、doctor 表格、权限策略和文档矩阵，并增加 drift test。

## 4.9 P1：状态模型分裂，schema/migration 不统一

当前至少存在 team state、case state、Evidence Board、MCP state、continuation/decision 等多类状态。Team state 的 `parseTeamState()` 只检查对象、schemaVersion、runs 数组、run id 和 jobs 数组，没有验证 job status、agent、routeId、时间戳、activeRunID 等深层字段。

状态类型还存在多个独立版本字段和生命周期，`loadJsonFile<T>()` 之类的泛型读取不能提供 runtime validation。

### 改进

统一 envelope：

```json
{
  "schemaVersion": 2,
  "caseId": "...",
  "revision": 123,
  "updatedAt": "2026-08-01T00:00:00Z",
  "writer": "session-id",
  "payload": {}
}
```

- 使用 Zod 或等价 schema；
- 建立 migration registry，支持 v1 -> v2；
- 每个事件带 sequence、writer、correlationId；
- 对并发更新采用 optimistic revision check；
- 提供 state doctor、export/import、GC 和 redaction；
- 明确 case/session/worktree 的生命周期边界。

另外，`src/team-reducer.ts` 中非法 job transition 当前静默返回原 job：

```ts
if (!canTransitionTeamJob(job.status, next)) return job
```

调用者无法知道状态转换失败。应返回 `{ ok, previous, current, reason }` 或抛出可诊断错误；对竞赛状态机而言，静默失败比显式失败更危险。

## 4.10 P1：Team Mode 缺少完整 supervisor 策略

已有 polling、session event、恢复和 cancellation，但静态审查没有看到统一的 worker supervisor 契约来处理：

- worker 永久 idle/卡死超时；
- crash 后的自动重试上限；
- orphan session 清理；
- worker session 已被外部删除后的补偿；
- parent session 不存在时的通知策略；
- 多进程/多实例 fencing。

`retrying` 状态存在不代表系统已经拥有可靠 retry policy。

建议引入：

```text
job lease + heartbeat + deadline + retry budget + backoff + owner token
```

每个 worker 需要 `startedAt`、`lastHeartbeatAt`、`deadlineAt`、`attempt`、`ownerGeneration`。超时后由 supervisor 选择 retry、interrupt、fail 或降级，不要只依赖模型事件。

## 4.11 P1：MCP lease 存在外部连接竞态和状态漂移

`src/skill-mcp-manager.ts` 的 `ensureNamedServerLeases()` 在锁内决定 `toActivate`，锁外执行 `addAndConnect()`，之后再次写 lease。两个调用者可能同时判断“未连接”并同时连接；release 也存在“先标记 disconnected，后调用外部 disconnect”的中间态。disconnect 失败时，状态可能已显示未连接但实际连接仍存在。

动态 MCP 还需要更明确区分：server 不存在、添加失败、连接失败、已存在、健康检查失败和 fallback。

建议：

- lease 状态使用 `pending -> connecting -> connected -> disconnecting -> disconnected/unknown`；
- 连接操作带 generation/fencing token；
- lease 加 TTL、heartbeat、owner session；
- disconnect 失败保留 `unknown`，进入补偿队列；
- request/lease 做主动 expiry sweep；
- activation/disconnect 记录 audit；
- MCP 不可用时自动映射到本地工具/RAG fallback；
- 增加双进程竞争测试、重复 activate/release 幂等测试。

## 4.12 P1：路径与网络策略没有完全统一

`tools/lib/path-policy.ts` 的 `resolveAllowedPath()` 具备 allowed roots、realpath、敏感路径等较完整策略，但 `tools/lib/workspace-path.ts` 的 `resolveInsideWorkspace()` 主要是 lexical `path.resolve`/relative 检查，不能统一处理 symlink/junction、UNC、NTFS 特殊路径和敏感目录。

例如 `tools/web/ctf-web-pattern-search.ts` 使用：

```ts
const patternDir = path.resolve(root, args.patternDir || DEFAULT_PATTERN_DIR)
```

这类路径需要逐个审计。`tools/web/ctf-web-observe.ts` 直接 `fetch(url)`，未见明显的 `CTF_ALLOWED_HOSTS` 约束，也应纳入网络目标策略。

改进为单一 `resolveCtfPath()` 和 `requestCtfTarget()`：

- realpath 后再判断 containment；
- 拒绝 symlink/junction escape；
- 明确读/写/执行根；
- 统一大小写、UNC、设备路径处理；
- 网络允许 host、端口、协议、redirect、DNS rebinding 和请求次数；
- 对响应中的 token、cookie、flag、密钥做最小必要 redaction。

## 4.13 P1：Crypto 与 Misc 的真正闭环明显不足

工具盘点显示：

```text
crypto: 2 个工具
misc:   1 个工具
```

`ctf-crypto-analyze` 和 `ctf-rsa-probe` 能做 primitive 关键词分析、参数 inventory、RSA 位数/小指数/shared-prime/CRT hint，但离完整求解仍有很大距离。

Crypto 至少应补齐可执行模块：

- RSA：common modulus、Håstad、Wiener、低私钥、shared prime、broadcast、部分泄漏、CRT fault；
- ECC/ECDSA：nonce reuse、弱 nonce、invalid curve、small subgroup、签名伪造；
- 格/数论：LLL、Coppersmith、隐藏数问题；
- 对称密码：CBC padding oracle、CTR/GCM nonce reuse、密钥/IV 重用、bit flipping；
- Hash：length extension、碰撞/截断、HMAC 误用；
- PRNG：MT19937、LCG、时间种子、状态恢复；
- Oracle transcript：记录请求、响应、重放条件和停止条件。

Misc 应补齐：

- pyjail/Python sandbox escape；
- parser differential、协议状态机；
- constraint/SAT/SMT 包装器；
- 编码链自动识别与验证；
- esolang、QR/RF、地理/OSINT（在授权竞赛范围内）；
- 交互式题目的 transcript/replay。

每个模块都必须提供“输入 -> 推断 -> payload -> oracle -> 可重放脚本”的最小闭环，而不是只返回下一步建议。

## 4.14 P2：RAG 和 Prompt 资产偏大，存在上下文污染

`rag/knowledge/pattern-cards` 约 90 MB，存在多个历史版本（v2-v9）、大型外部 cards 和中间构建/Smoke 资产。Agent/skill 文本也较大，例如最大 Pwn agent、Rev skill 已达到数十 KB。

风险：

- clone、CI、检索和启动变慢；
- 历史内容被误检索；
- provenance、去重和冲突处理不透明；
- prompt token 被低价值 payload 消耗；
- 技能、Agent、hook、tool contract 发生冲突。

建议：

- 运行时只保留 current index、manifest、curated cards；
- 历史版本移到 release artifact/Git LFS；
- card 返回短摘要、适用条件、反例、来源和 confidence；
- retrieval 按 lane/family/difficulty 动态加载；
- 设置 prompt/RAG token budget；
- 对重复、冲突、无 provenance 的卡片做 quarantine；
- 建立 prompt contract lint，检测同一工具不同参数/状态约定。

## 4.15 P2：测试通过不代表执行路径覆盖足够

已执行结果：

- `npm test -- --reporter=dot`：76 个测试文件通过，509 个测试通过；
- `npm run check:content`：通过；
- `npx tsc --noEmit`：通过；
- `npm run lint`：通过；
- `npm run release:check`：通过；
- `npm run test:coverage -- --reporter=dot`：失败。

coverage 结果约为：

```text
Lines:      35.44%
Functions:  30.85%
Branches:   60.01%
```

`tools/lib/**/*.ts` 的 branch threshold 约 70%，实际约 66.95%。这说明当前测试数量不少，但真实工具执行、外部命令失败、权限拒绝、超时、跨平台、MCP 竞态、状态损坏和恢复路径仍覆盖不足。

改进重点不是盲目追求行覆盖，而是建立行为覆盖矩阵：

- tool import success/failure/deferred；
- dependency missing/fallback；
- path traversal/symlink/UNC；
- command timeout/kill/orphan；
- network deny/redirect/DNS change；
- state corrupt/partial write/concurrent writer；
- team worker crash/retry/cancel/parent gone；
- MCP duplicate activate/release/disconnect failure；
- oracle candidate/false positive/replay failure。

## 5. 面向实战的目标架构

建议把系统分成五个稳定层：

```text
1. Challenge Intake
   附件、题面、服务、文件树、魔数、依赖、权限和预算

2. Capability & Routing
   family、路由证据、cheap probes、工具 readiness、动态重路由

3. Solver Runtime
   假设、工具调用、尝试、artifact、worker、预算和 cancellation

4. Verification
   primitive confirmation、oracle、replay、flag proof、evidence projection

5. Learning & Release
   benchmark、失败归因、lesson、RAG curation、版本 gate
```

核心数据对象应统一为：

```ts
type ChallengeCase = {
  caseId: string
  challenge: ChallengeIdentity
  route: RouteDecision
  capabilities: CapabilitySnapshot
  budget: Budget
  hypotheses: Hypothesis[]
  attempts: Attempt[]
  artifacts: Artifact[]
  verification: VerificationState
  workers: WorkerState[]
  stateRevision: number
}
```

其中 `Attempt` 不能只存文本，而应存：工具、输入摘要、时间、退出码、stdout/stderr artifact、是否产生新事实、是否改变假设、失败原因。这样才能做停止条件、重试策略和赛后分析。

### Solver lifecycle

```text
intake -> triage -> route -> capability_check -> plan
      -> execute -> verify_primitive -> exploit
      -> oracle_verify -> reproduce -> solved
                         \-> blocked/degraded -> reroute
```

只有 `oracle_verify + reproduce` 才能把 case 标记为 solved；`candidate_flag`、`shell`、`interesting_output` 都只是中间证据。

## 6. Benchmark 与指标设计

### 6.1 必须记录的指标

- `flag_correctness`：独立 oracle 验证的精确成功率；
- `reproduce_success`：在干净环境重放成功率；
- `time_to_first_valid_hypothesis`；
- `time_to_flag`；
- `tool_call_count` 和失败调用数；
- `branch_count`、重复 probe 次数；
- token、模型调用次数和成本；
- 环境准备时间；
- evidence 完整度；
- false-positive rate；
- 按 family、题型、难度和依赖可用性分组的结果。

### 6.2 评测分层

1. **单工具契约测试**：schema、路径、退出码、artifact 和错误分类；
2. **能力 fixture**：一个原语一个小题，例如 ret2win、RSA shared prime、PCAP credential；
3. **端到端公开题回归**：固定版本、固定环境、独立 oracle；
4. **扰动测试**：缺失依赖、错误路径、网络漂移、decoy flag、输出编码、超时；
5. **竞赛模拟**：时间预算、并行 worker、服务重启和多题目录。

### 6.3 Benchmark gate

发布至少满足：

- 所有 P0 fixture 无 silent skip；
- flag correctness 和 reproduction 通过率达到预设阈值；
- 不允许未验证 candidate flag 计为 solved；
- 高风险工具全部有权限审计；
- state doctor 能检测并修复注入的损坏状态；
- 在缺失 Ghidra/Docker/tshark 等依赖时 readiness 明确 degraded，而非绿色成功。

## 7. 90 天落地路线图

### 第 1-2 周：止血和真实性

- 修复 benchmark 空输出即成功；
- 引入独立 flag oracle；
- 给 Pwn/Web/通用 runner 分离 `candidate` 与 `verified`；
- 工具加载产生结构化 report；
- 关键工具缺失阻塞或显式 degraded；
- 对 `python/node/npx` 和 Docker 高风险权限默认 ask；
- 确认当前工作树删除的 `ctf-rules.md`、`rules-cn.md`、`opencode.json` 是否有意，并修复发布/安装文档链。

### 第 3-4 周：状态和运行时可靠性

- Evidence Board 单一事实源；
- atomic transaction、lock、schema validation、migration；
- team transition 非法时返回诊断错误；
- worker heartbeat/deadline/retry budget；
- MCP lease 状态机、TTL、fencing 和 disconnect compensation；
- 添加双进程竞争和崩溃恢复测试。

### 第 5-8 周：真实分类闭环

- 每类建立至少 10 个最小 fixture；
- Web/Pwn/Rev 先做 primitive-to-oracle 闭环；
- Crypto 完成 RSA 五类攻击、ECDSA nonce reuse、CBC/CTR oracle、PRNG；
- Misc 完成 pyjail、SMT、编码链、交互协议；
- 统一工具 manifest 和 readiness matrix；
- 路由加入文件结构 probe 和动态重路由。

### 第 9-12 周：优化获奖能力

- 公开题回归和竞赛模拟；
- fast/expert 自动升级；
- RAG 去重、压缩和按 lane 动态加载；
- 统计 time-to-flag、错误分支、成本和 false positive；
- 根据失败聚类修订 skills，而不是凭感觉继续堆 prompt；
- 形成 release gate，任何新版本必须证明真实 fixture 没有回退。

## 8. 建议优先修改的文件/模块

### 第一批（P0）

1. `scripts/check-*-benchmarks.ts`：空输出必须失败或明确 CI skip；
2. 新增 `src/flag-oracle.ts`，并接入 Pwn/Web/通用 solver；
3. `src/ctf-tools.ts`：记录 load errors、criticality、fallback；
4. `src/plugin-support.ts`：结构化权限策略；
5. `tools/pwn/ctf-pwn-runner.ts`、`ctf-pwn-runbox.ts`：成功语义与隔离；
6. `tools/core/ctf-evidence-board.ts`：schema、lock、atomic projection；
7. `scripts/`：增加 challenge fixture harness。

### 第二批（P1）

1. `src/tool-manifest.ts`、`src/tool-packs.ts`、`src/tool-metadata.ts`：统一来源；
2. `src/team-state.ts`/`src/team-reducer.ts`/`src/team/team-runtime-core.ts`：supervisor 和诊断 transition；
3. `src/mcp/*`、`src/skill-mcp-manager.ts`：lease 状态机；
4. `tools/lib/path-policy.ts`、`workspace-path.ts`、Web observe：统一路径/网络 policy；
5. `packages/ctf-core/src/router.ts`：cheap probes、calibration、reroute。

### 第三批（P1/P2）

1. Crypto 模块化攻击库和 oracle transcript；
2. Misc solver/constraint/protocol/pyjail 能力；
3. Rev/PE/Android 真实 fixture；
4. RAG manifest、压缩、去重和 provenance；
5. coverage matrix 与 fault injection。

## 9. 不建议当前阶段做的事情

- 不要继续以“新增几十个工具”作为主要进展指标；
- 不要把模型输出的 `STATUS: completed`、shell、flag-like regex 当作成功；
- 不要把更多长篇技能文档直接塞进所有 Agent；
- 不要让所有工具默认网络可用或默认执行器自动批准；
- 不要在没有独立 oracle 的情况下用公开题“看起来像成功”的日志作为 benchmark；
- 不要在状态 schema 尚未统一时继续扩展更多并行状态文件；
- 不要为了提高 coverage 简单排除真正困难的工具路径。

## 10. 当前工作树与验证说明

### 10.1 工作树边界

本次收尾复核日期为 **2026 年 8 月 1 日**。开始复核前工作树已经包含大量用户未提交改动；本次未执行 `git reset`、`git checkout`、`git clean` 或任何会覆盖用户改动的操作。

复核结束时，`git status --porcelain=v1` 显示：

```text
195 项已跟踪变更（其中 3 项删除）
58 项未跟踪文件
```

未跟踪文件均为源码、测试、文档或 TypeScript 声明；未发现本次检查遗留的未跟踪编译 `.js`、coverage、tarball 或其他构建副产物。`scripts/lib/tool-checks.d.mts` 是 TypeScript 对 `tool-checks.mjs` 的必要声明文件，已由 pack 检查确认会进入 npm 包，不能作为垃圾文件删除。

`ctf-rules.md`、`rules-cn.md`、`opencode.json` 的删除/替换意图仍应由改动作者在提交前确认；现有发布 smoke 已通过，但这不能替代对兼容入口和用户迁移路径的人工确认。

### 10.2 本次收尾验证结果

| 检查                                                                                     | 结果             | 说明                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                          | PASS             | TypeScript、内容校验、**104** 个测试文件 / **650** 个测试通过。                                                      |
| `npm run lint`                                                                           | PASS             | TypeScript + ESLint 通过。                                                                                           |
| `npm run format:check`                                                                   | PASS             | Prettier 通过。                                                                                                      |
| `npm run test:coverage`                                                                  | PASS             | coverage 门禁通过；`tools/lib/**/*.ts` branch coverage 为 **312/440（70.91%）**，高于 70% 阈值。                     |
| `npm run tools:verify`                                                                   | PASS（degraded） | `sage` 缺失；它仅是 Crypto 路径的可选依赖，输出已明确提示，其他列出的工具可用。                                      |
| `npm run release:check`                                                                  | PASS             | npm 包形状和隔离安装 smoke 通过。                                                                                    |
| `npm run pack:check`                                                                     | PASS             | 构建并干跑打包通过；817 个文件，约 3.3 MB 压缩 / 24.6 MB 解压。                                                      |
| `git diff --check`                                                                       | PASS             | 未发现 diff 空白错误。                                                                                               |
| `npm run check:benchmarks`                                                               | **按预期 FAIL**  | Web benchmark 没有 solver 输出，命令以非零退出，证明空目录不再被误判为成功。                                         |
| `CTF_BENCH_ALLOW_EMPTY=1; npm run check:benchmarks`                                      | SKIP             | 六个 family 都明确输出 SKIP；这是本地开发覆盖开关，**不是** benchmark 成功。                                         |
| `npx vitest run test/benchmark-empty-dir.test.ts test/benchmark-fixture-harness.test.ts` | PASS             | 最小 fixture harness 已通过：支持 `challenge.yaml` 发现、候选 artifact 扫描、独立 oracle 验证和 replay marker 检查。 |

另外，Pwn runner 已将成功语义升级为 `pwn_runner_summary.v2`：`local_success` 与已执行的 `remote_success` 只能由独立 oracle 验证为真；shell 或 flag-like 输出仅写入 `candidate_evidence`。对应的 oracle 正反例测试已通过，且源码中没有残留 `pwn_runner_summary.v1` 引用。

本轮还补上了 benchmark 的**最小 fixture 基础设施**：六个 family checker 已统一接入 `scripts/lib/benchmark-checker.ts`。当目录内存在 `challenge.yaml` 时，会切换到 fixture 模式，读取 manifest、收集 candidate files、调用 `src/flag-oracle.ts` 做独立验证，并在 fixture 声明 `replay_required` 时强制检查 replay marker；当目录内没有 fixture 时，仍保留原有 family-specific 文本规则检查与“空目录默认失败”语义。

### 10.3 本轮验收结论

- **工程质量、格式、类型、单元/契约测试、打包和安装 smoke：有条件通过。**
- **真实 challenge regression / 可证明解题能力：未通过，仍为 P0 阻断项。**
- **不得**因 `release:check`、coverage 或 `CTF_BENCH_ALLOW_EMPTY=1` 返回零退出码，而宣称插件已经满足本计划第 6 节定义的实战 benchmark gate。

当前仓库里的 `benchmarks/` 仍只有 14 个 `expected_behavior.md`/说明类文件，仓库内真实 `challenge.yaml` fixture 数量仍为 0。也就是说，**fixture harness 基础设施已就位，但公开 challenge corpus 仍缺失**；项目仍没有“题目启动 → solver → 独立 oracle → 干净环境 replay → artifact”的真实闭环，更没有每类至少 10 个 fixture 的覆盖。

## 10.4 Team Mode 运行时纪律复评（2026 年 8 月 2 日）

本节以当前工作树和最新测试结果为准；它覆盖并 supersede 10.2 中较早的历史收尾记录。当前 Team Mode 相关实现已经通过全量工程检查（116 个测试文件、762 个测试；本轮新增递归 Worker 参数扫描、JSON-encoded 参数门禁、未来 Team 工具前缀拒绝、协调器专属控制工具覆盖、锁诊断的 acquisition race 修复，以及父会话删除后的 worker 补偿清理），但这不等价于真实 CTF 解题能力或生产级故障恢复已经验收。历史上误执行 `npm exec tsc --noEmit` 产生的未跟踪 `.js` 副产物已清理；后续应使用 `npm run check` 或 `npm exec tsc -- --noEmit`。

### Team Mode 评分

| 维度                      |                    评分 | 当前结论                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expert 运行时硬门禁       |                   4.5/5 | dispatch 前 Evidence/3 routes/2 jobs 检查、wave 状态门禁、普通 task/delegate 禁用均已在 hook 边界执行。                                                                                                                                                                                                                                                                                                     |
| Worker 隔离与旁路防护     |                     4/5 | Worker 的共享状态写入、Team 控制工具、handoff/MCP/legacy Team Mode 旁路已拒绝；损坏 `.ctf-team.json` 时高权限操作 fail-closed。                                                                                                                                                                                                                                                                             |
| Team lifecycle 集成可信度 |                     4/5 | 已覆盖 dispatch → collect → close、取消、abort 失败后 recover、cancel-route，以及模拟重启、通知失败重试、父会话删除后的 worker abort/状态收敛、陈旧事件、deadline、跨进程 acquire/release、硬杀后的 stale takeover、旧 owner 写入 fencing、replacement lease 保护和忙锁 fail-closed；仍缺真实多实例 fencing。                                                                                                                                     |
| 持久化与恢复              |                     4/5 | session surface 和 Team state 具备启动恢复、state hygiene 和 `cancel_failed` 重试逻辑；deadline reconcile 已支持有界 replacement-session retry，并用 owner token 防止陈旧事件覆盖新 worker；state lock 已按 worktree 隔离并提供 active/stale/released 诊断，`atomicUpdateJsonFile` 在提交前后执行 lease fence，且旧 owner 不能删除 replacement lease，但 Evidence、case、board、Team state 仍不是单一事务。 |
| 真实 CTF 结果验证         |                   1.5/5 | 仓库仍没有真实 `challenge.yaml` corpus、独立 flag oracle + clean replay 的 Team Mode 成功率数据。                                                                                                                                                                                                                                                                                                           |
| **Team Mode 总体成熟度**  | **可用 Beta，非生产级** | 运行时纪律已不再只是 prompt 建议，但还不足以称为 production-ready 或成熟解题平台。                                                                                                                                                                                                                                                                                                                          |

### 本轮新增的可验证改进

- `ctf-team-recover` 被纳入 Expert 控制工具集合，并对 Worker 同时做工具策略拒绝和 child-session surface 隐藏，避免恢复入口成为旁路。
- `ctf-team-adopt` 提供显式 parent rebind：必须指定 `runID` 与 reason，原 parent 必须被 SDK 明确判定为不存在，且 run 不得有 active/retry/cancel_failed worker；成功后写入 bounded adoptionHistory 并把 notification 状态重新交给新 Expert parent。
- Worker child session 不再暴露 Team dispatch/status/collect/cancel/cancel-route/close/recover 以及 legacy `ctf-team-mode`。
- Worker policy 增加对 `ctf-python-inline`、`ctf-python-parallel`、`ctf-background-job` 的共享状态写入防护；只读分析仍可用。
- Worker 参数门禁现在递归遍历对象、数组和 JSON-encoded 参数，覆盖嵌套 `command`/`script`/`path`，并将全部未来 `ctf-team-*` 工具自动视为 coordinator-only；continuation、skill-MCP lifecycle、whitebox handoff 和知识反馈写入口也不再向 Worker 开放。
- 配置层只允许关闭非安全辅助 hooks；Worker/Expert tool boundary 不是 `disabled_hooks` 可关闭项，新增回归测试防止配置误把 Team safety gate 关闭。
- `ctf-team-cancel`、`ctf-team-cancel-route`、`ctf-team-recover` 对 `cancel_failed` 做可重试 abort；取消与 replacement 启动竞态会继续追踪新 session，follow-up abort 失败或 session 链在有界轮次内不收敛时 fail-closed；`ctf-team-close` 在取消不确定时 fail-closed。
- `src/team/team-runtime-core.ts` 已具备 per-worker deadline、heartbeat、timeout abort、owner-token fencing 和 bounded replacement-session retry；retry claim 以持久化状态原子占位，`retrySessionID` 在 MCP/prompt 前落盘，startup/explicit recovery 会清理崩溃遗留的 pending replacement；retry budget 用尽、旧 worker abort 失败、replacement 启动失败或清理失败均 fail-closed，并清除 retry reservation 元数据。
- `test/team-supervisor.test.ts` 覆盖 deadline/retry 的纯决策边界；`test/team-lifecycle.integration.test.ts` 还覆盖 replacement session、并发 reconcile 单次 claim、replacement startup failure、replacement cleanup failure、retry budget exhausted、pending replacement restart recovery、模拟插件重启恢复、父会话通知重试、父会话删除后的有界 worker 清理、陈旧事件忽略，以及取消与 pending/promoted replacement 的真实竞态。
- `src/file-lock.ts` 已移除进程全局 lock directory：锁 sentinel 按目标 state 所在 worktree 派生，并对相对/绝对路径做归一化；新增 owner token、`FileLockLease.assertOwned()` 以及基于 lock-directory identity 的 fenced release，防止 stale takeover 后旧进程继续提交或删除 replacement lease。`atomicUpdateJsonFile`、Evidence board 和 canonical case state 在关键提交边界执行 fence；case event JSONL 的 append/read、legacy migration 也通过跨进程 lease 串行化。`test/file-lock.test.ts` 现覆盖两个独立 Node 进程并发递增、硬杀后 stale lease takeover、旧 owner 直接写入拒绝、atomic state 写入拒绝、旧 owner 释放 replacement lease 拒绝、忙锁获取失败 fail-closed、多 worktree 隔离和 Team lock 诊断；`test/case-state.test.ts` 增加并发 event append 与并发 legacy migration。`inspectTeamLockState()` 现在报告 sentinel、active/stale/released 状态和年龄，便于 `ctf-team-recover` 诊断。
- 之前因错误执行 `npm exec tsc --noEmit` 生成的未跟踪 JavaScript 副产物已清理；后续应使用 `npm run check` 或 `npm exec -- tsc --noEmit`，避免把编译产物混入工具发现路径。

### 发布前剩余阻断项

1. 在干净临时目录中重复 `npm run check`，并把超时/资源竞争结果纳入 CI；当前本地全量检查已经通过（`npm run check`：116 个测试文件、762 个测试），但仍需独立环境复现。
2. 补齐真实插件重启、父会话消失、通知失败、陈旧事件和 replacement startup failure 的故障注入；父会话删除后的本地补偿清理已有覆盖，但仍需真实 OpenCode 多实例 fencing、父进程断连/崩溃注入和 disconnect 补偿。
3. 为至少一个真实公开题目加入 challenge fixture、独立 oracle、clean replay 和 Team Mode 端到端记录；没有这类数据，不得把“纪律成熟”写成“解题成功率成熟”。
4. 将 Evidence board、case state、Team state 和事件日志逐步收敛为带 revision/journal 的一致性边界，并加入故障注入/repair 验收。

## 11. 最终建议

把项目目标从：

> “拥有很多 CTF 工具、Agent 和流程文档”

升级为：

> “在受控、可重复、可审计的挑战 fixture 上，能从 intake 到 primitive、exploit、独立 oracle、重放和 Evidence 完整闭环，并且在工具缺失、状态损坏和危险操作时可预测地降级。”

如果只能选择三个动作，优先做：

1. **真实 challenge regression + 独立 flag oracle**；
2. **统一状态/工具/权限契约并修复高风险自动 allow**；
3. **先把 Crypto、Misc 和现有 Pwn/Web/Rev 的最小闭环做深，再扩展工具数量**。

完成这三项后，插件才会从“有潜力的 CTF Agent 平台”进入“可以用数据证明持续变强、具备竞赛获奖可能”的阶段。

## 12. 收尾遗留项与合并前清单

| 优先级   | 项目                    | 当前判定    | 合并/发布前所需动作                                                                                                                                                                                                                                                       |
| -------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | 真实 fixture 与回归     | **BLOCKED** | 最小 fixture harness 已就位，但仓库内公开 fixture 仍为 0；至少先补一个完整的公开 fixture 闭环，再按第 4.1/6.3 节扩展至每个 family 的受控 `PASS/SKIP/FAIL`。CI 不允许通过空目录。                                                                                          |
| P0       | Flag Oracle 覆盖范围    | PARTIAL     | Pwn runner 已严格接入；仍需让 Web exploit、通用 CLI/MCP solver 共用相同 oracle，并将 replay 作为 solved 的必要条件。                                                                                                                                                      |
| P0       | Evidence Board 事务恢复 | PARTIAL     | 当前锁和单文件 temp+rename 能防止单文件半写，但 board、`Evidence.md`、case state、event 之间仍不是单一事务。应加入 revision/journal、故障注入、verify/repair 和恢复测试。                                                                                                 |
| P0       | 启动 readiness 可见性   | PARTIAL     | `ToolLoadReport`、critical missing 与 health 文件已有结构和测试；仍需在真实 OpenCode `/ctf` 会话中注入导入/依赖失败，确认初始摘要显示 `degraded`/`blocked`。                                                                                                              |
| P1       | Team/MCP 并发恢复       | PARTIAL     | deadline、bounded replacement retry、owner fencing 和 lease 状态机已有单元/集成覆盖；state lock 已覆盖跨进程 acquire/release、硬杀后 stale takeover、旧 owner 恢复写入拒绝、replacement lease 保护与 fail-closed，但还缺真实多实例 fencing 和 disconnect 补偿的故障注入。 |
| P1       | 路由校准与动态重路由    | PARTIAL     | cheap probes 和状态迁移已有基础；未见以真实 fixture 度量 confidence、reroute 和误路由率的校准报告。                                                                                                                                                                       |
| P1       | 路径/网络统一策略       | PARTIAL     | workspace symlink guard 与 allowed-root 检查已增强；仍应把所有 Web/network 调用迁移到统一目标策略，并测试 redirect、DNS 漂移、UNC/junction。                                                                                                                              |
| 发布卫生 | 工作树审阅              | REQUIRED    | 逐项审阅 195 个已跟踪变更和 56 个未跟踪文件；确认三个历史入口文件的删除/替代策略，再拆分成可审查提交。                                                                                                                                                                    |

**建议发布标签：** 当前版本可以标记为“工程门禁通过、功能持续开发中”，但不应标记为“真实 CTF benchmark 已验证”或“竞赛 readiness 已验收”。
