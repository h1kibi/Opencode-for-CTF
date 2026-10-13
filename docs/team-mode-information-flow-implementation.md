# Team Mode 信息流改进与实现方案

## 1. 文档目标

本文定义 Team Mode 从当前“Expert 静态派发任务、Worker 完成后回传最终文本”的模型，演进为：

```text
题目信息 / 已确认 Fact
        ↓
ctf-expert 推理、更新 Evidence
        ↓
发布 Intent
        ↓
Worker 并发认领并执行
        ↓
结构化 Fact / Event 增量回流
        ↓
Expert 再评估、收敛、继续派发或关闭
```

目标不是重写现有生命周期管理。现有的持久化、文件锁、owner token、超时重试、取消、恢复、parent session 清理继续作为底座；本方案只补齐信息流和任务语义。

## 2. 当前实现基线

### 已有能力

- `src/team/team/team-runtime-core.ts` 已支持 worker 创建、并发启动、collect、cancel、retry、recover、adopt 和 parent session 清理。
- `src/team/team/team-state.ts` 使用持久化 JSON、原子更新和状态规范化。
- `src/file-lock.ts` / `src/state-store.ts` 提供跨进程锁和更新保护。
- `src/worker-policy.ts` 限制 Worker 写入 Evidence、修改核心状态和二次派发。
- `tools/core/ctf-evidence-board.ts` 支持 Expert 维护 Evidence.md、fact、route 和 closure 信息。
- `agents/ctf-expert.md`、`skills/ctf-expert/SKILL.md` 已规定 Fact、Route、Evidence 的工作规范。

### 当前缺口

1. `ctf-team-dispatch` 是静态 Push：调用方直接指定 `agent + routeId + objective`。
2. 没有独立的 Intent 实体、Intent Pool、Claim、Lease 和认领冲突处理。
3. Worker 没有增量 Fact 上报协议；系统主要在 `session.idle` 后读取最近消息并截取最终文本。
4. Fact 是否有证据、是否绑定 route、是否由 Expert 接受，主要由 prompt 约束，Runtime 没有结构校验。
5. 题目信息分散在 Evidence.md、`.ctf-evidence-board.json`、`case.json`、`events.jsonl`、`inventory.md`、`route.json`、`primitive.json`、`closure.json` 和 `signal-memory.yaml`，新增 Intent 不应再制造一套独立账本。

## 3. 设计原则

### 3.1 Expert 是决策者，Worker 是观测者和执行者

- Worker 可以提交观察、测量、命令结果、文件证据、失败和候选结论。
- Worker 不可直接把内容写入 Evidence.md 或将 Fact 标成 confirmed。
- Expert 负责接受、驳回、降级、合并和 supersede Fact。
- Expert 负责根据 Fact 创建、取消、替换和关闭 Intent。

### 3.2 一套事实账本，多种投影

不新增 `facts.json`、`intents.json`、`worker-results.json` 等平行状态文件。

建议：

- `.ctf-evidence-board.json`：当前 Fact、Intent、Route 的可读状态投影；
- `events.jsonl`：不可变事件流，记录提交、接受、认领、完成和状态变更；
- `Evidence.md`：Expert 面向人类的汇总投影；
- 既有 `inventory.md`、`route.json`、`primitive.json`、`closure.json` 保持各自用途，不承担 Intent 生命周期。

### 3.3 所有并发写入都必须经过现有锁和 fencing

Intent claim 不能只依赖内存状态。必须复用：

- `withFileLock`；
- `atomicUpdateJsonFile`；
- `revision`；
- `ownerToken`；
- `retrySessionID`。

旧 Worker 的迟到结果必须能够被识别并拒绝，不能重新激活已取消或已 supersede 的 Intent。

### 3.4 文本是展示层，结构化 packet 是协议层

最终 assistant 文本仍可作为兼容 fallback，但不能作为唯一 Fact 来源。所有可用于决策的 Fact 必须有：

- 来源 Worker、Intent、Session；
- Route 绑定；
- evidence 引用；
- 状态和置信度；
- 唯一 ID。

## 4. 数据模型

### 4.1 Fact

建议在 `src/team/team-types.ts` 增加：

```ts
export type TeamFactKind =
  | "observation"
  | "measurement"
  | "artifact"
  | "error"
  | "negative"
  | "candidate"

export type TeamFactConfidence = "observed" | "probable" | "speculative" | "confirmed"
export type TeamFactStatus = "pending" | "accepted" | "rejected" | "superseded"

export type TeamEvidenceRef = {
  type: "command" | "file" | "response" | "hash" | "trace"
  value: string
}

export type TeamFact = {
  id: string
  runId: string
  routeId: string
  sourceJobId: string
  sourceSessionId: string
  intentId?: string
  kind: TeamFactKind
  statement: string
  evidence: TeamEvidenceRef[]
  confidence: TeamFactConfidence
  status: TeamFactStatus
  supersedesFactId?: string
  createdAt: string
  updatedAt: string
}
```

约束：

- Worker 新建的 Fact 初始只能是 `pending`，不能直接是 `confirmed`；
- `confirmed` 必须由 Expert 的接受操作产生；
- `evidence` 不能为空，除非 `kind` 为 `error` 且错误本身有结构化诊断；
- `sourceJobId`、`sourceSessionId`、`runId` 必须属于当前 Team Run；
- `routeId` 必须是当前 Run 的有效 Route；
- statement 长度、evidence 数量、单条 evidence 长度必须有限制；
- Fact 必须幂等，重复 packet 使用相同 `id` 时不能产生重复记录。

### 4.2 Intent

```ts
export type TeamIntentConcurrency = "exclusive" | "parallel" | "speculative"
export type TeamIntentStatus =
  | "open"
  | "claimed"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "superseded"

export type TeamIntent = {
  id: string
  runId: string
  routeId: string
  title: string
  objective: string
  basedOnFactIds: string[]
  expectedObservation?: string
  stopCondition?: string
  failureCondition?: string
  requiredCapabilities: string[]
  concurrency: TeamIntentConcurrency
  status: TeamIntentStatus
  claimedBy?: string
  claimToken?: string
  claimExpiresAt?: string
  attempts: number
  maxAttempts: number
  createdBy: "expert" | "migration"
  createdAt: string
  updatedAt: string
}
```

Intent 创建必须满足：

- 至少绑定一个 Fact，或明确标记为初始侦察 Intent；
- 绑定一个 Route；
- 有可执行 objective；
- 有成功观察条件或 stop condition；
- 有 `maxAttempts`，默认值受现有 Team 限额约束；
- `requiredCapabilities` 只声明能力，不直接强绑定具体 Worker；
- `concurrency` 明确是否允许同一意图重复尝试。

### 4.3 Claim Lease

Claim 不单独建立持久化实体，直接存储在 Intent 上：

```text
status = claimed/running
claimedBy
claimToken
claimExpiresAt
```

状态更新必须在锁内完成：

```text
open
  → lock
  → verify revision/status/route
  → assign claimedBy + claimToken + expiry
  → attempts++
  → revision++
  → unlock
```

Worker 执行期间提交 Fact、完成 Intent、失败或续租时都必须验证 `claimToken`。Token 不匹配时返回 stale claim，不得覆盖新 Owner 的状态。

### 4.4 Event

事件写入既有 `events.jsonl`：

```ts
export type TeamEvent =
  | { type: "fact_submitted"; fact: TeamFact }
  | { type: "fact_accepted"; factId: string; acceptedBy: string }
  | { type: "fact_rejected"; factId: string; reason: string }
  | { type: "intent_created"; intent: TeamIntent }
  | { type: "intent_claimed"; intentId: string; jobId: string; claimToken: string }
  | { type: "intent_started"; intentId: string; jobId: string }
  | { type: "intent_blocked"; intentId: string; reason: string }
  | { type: "intent_completed"; intentId: string; jobId: string; factIds: string[] }
  | { type: "intent_failed"; intentId: string; jobId: string; retryable: boolean; reason: string }
  | { type: "intent_released"; intentId: string; reason: string }
  | { type: "intent_superseded"; intentId: string; replacementIntentId?: string; reason: string }
```

事件是审计记录，不是绕过状态机的写入口。任何状态变更仍需走 Team State 更新函数。

## 5. Worker 信息协议

### 5.1 Packet 格式

Worker prompt 要求输出机器可解析的 packet，同时保留人类可读 summary：

```json
{
  "protocol": "ctf.team.worker.v1",
  "type": "fact",
  "intentId": "intent-R1-001",
  "routeId": "R1",
  "statement": "目标是 ELF x86-64，NX 已启用",
  "kind": "observation",
  "evidence": [
    {"type": "command", "value": "file ./chall"},
    {"type": "response", "value": "ELF 64-bit LSB executable, x86-64"}
  ],
  "confidence": "observed"
}
```

完成 packet：

```json
{
  "protocol": "ctf.team.worker.v1",
  "type": "intent_result",
  "intentId": "intent-R1-001",
  "status": "completed",
  "summary": "确认存在 ret2win 候选路径",
  "factIds": ["fact-001", "fact-002"],
  "artifacts": ["work/solve.py"]
}
```

### 5.2 解析顺序

在 `team-runtime-core.ts` 增加统一解析器，不要在 `collect`、event handler、retry 三处各自解析：

1. 读取新增 assistant 消息或显式 worker event；
2. 提取 fenced JSON packet；
3. 校验 protocol、类型、字段、长度和来源；
4. 去重并写入 pending Fact/event；
5. 无法解析时保留截断后的文本作为 `unstructured_result`，但不能自动生成 confirmed Fact；
6. 返回增量 cursor，避免每次读取最近 20 条消息后重复处理。

### 5.3 增量 cursor

为每个 Worker Job 增加：

```ts
lastCollectedMessageId?: string
lastFactSequence?: number
```

collect 不再每次只看最后一条文本，而是从 cursor 后处理新增消息。消息 API 没有稳定 ID 时，使用受限的消息序列和内容 hash 作为 fallback，并将 fallback 标记为低可靠。

## 6. Expert 工作流

### 6.1 初始化和题目信息记录

Expert 进入 Team Mode 后必须先完成：

1. 确认 challenge directory/worktree；
2. 初始化或读取 Evidence board；
3. 写入题目身份、文件、服务、入口、flag 格式等基础 inventory；
4. 建立恰好三条 Route；
5. 把初始观测登记为 Fact；
6. 由 Fact 生成第一批 Intent。

题目基础信息应保留在现有 inventory/Evidence 投影中，Intent 只引用 Fact ID，不复制大段题目描述。

### 6.2 每轮决策循环

Expert 每轮必须处理以下顺序：

```text
collect new Worker packets
  → review pending facts
  → accept/reject/supersede facts
  → update Evidence.md and route projection
  → inspect open/running intents
  → create, cancel, supersede or reprioritize intents
  → concurrently dispatch/claim eligible intents
  → collect next event batch
```

每个新 Intent 必须记录：

- `basedOnFactIds`；
- `routeId`；
- `expectedObservation`；
- `stopCondition`；
- `failureCondition`；
- 所需能力和并发策略。

### 6.3 Expert 工具接口

建议新增或扩展以下 Team 工具操作：

```text
ctf-team-intent action=create
ctf-team-intent action=list
ctf-team-intent action=claim
ctf-team-intent action=renew
ctf-team-intent action=complete
ctf-team-intent action=fail
ctf-team-intent action=release
ctf-team-intent action=supersede
ctf-team-facts action=list-pending
ctf-team-facts action=accept
ctf-team-facts action=reject
ctf-team-facts action=add
```

初期也可以不增加大量独立工具，而是在现有 `ctf-team-dispatch`、`ctf-team-collect` 和 `ctf-evidence-board` 增加 action；但内部必须调用统一的 Intent/Fact service，不能把状态逻辑继续堆到 runtime core 的各个工具 handler 中。

## 7. 调度和并发规则

### 7.1 兼容 Push 模式

现有调用：

```text
ctf-team-dispatch(jobs=[{agent, routeId, objective}])
```

迁移为内部操作：

```text
createIntent(..., createdBy="expert")
claimIntent(intentId, requestedWorker=agent)
startWorkerForClaim(...)
```

因此现有调用者不立即破坏，但 Team State 的真实任务对象统一为 Intent。

### 7.2 Pull 认领模式

新模式由 Worker 或 runtime 请求：

```text
claimNextIntent({
  workerId,
  agent,
  capabilities,
  routeIds,
  maxConcurrency
})
```

选择规则：

1. 只选择 `open` 且未过期的 Intent；
2. route 必须仍然有效；
3. capability 必须满足；
4. 已有同 route 的 exclusive Intent 时拒绝冲突任务；
5. 按 priority/createdAt 稳定排序；
6. claim 在锁内完成；
7. claim 成功后才创建 child session。

初期不让 Worker 直接调用 OpenCode dispatch API；由 Team runtime 代为认领和启动，保留权限和生命周期控制。

### 7.3 并发策略

- `exclusive`：同一 Intent 只能有一个 active claim；
- `parallel`：不同 Intent 可以同时执行；
- `speculative`：允许多个 claim，但必须写明不同 worker 的尝试，Expert 负责比较 Fact；
- 同一 Route 设置 active Intent 上限；
- 全局 worker 数、attempts、deadline 继续复用现有 Team 限额；
- 出现 live Route 或 confirmed closure Fact 后，Expert 应 supersede 无关 Intent，并调用现有 cancel-route。

## 8. 生命周期改造

### 8.1 Job 与 Intent 的关系

不删除现有 `TeamJob`。采用：

```text
TeamRun 1 ── N TeamIntent
TeamIntent 1 ── N TeamJob attempts
TeamJob 1 ── 1 child session
```

现有 TeamJob 负责 session 生命周期；TeamIntent 负责决策和认领生命周期。

### 8.2 状态映射

```text
Intent open       → 没有 active Job
Intent claimed    → Job queued/starting
Intent running    → Job running
Intent blocked    → Job blocked 或无 active Job
Intent completed  → Job completed/ready_for_synthesis
Intent failed     → Job failed；可按 attempts 重新 open
Intent cancelled  → Job cancelled
Intent superseded → Job cancelled/interrupted，不得重新认领
```

不要让 TeamJob 和 Intent 各自派生一套 run 状态。保留一个 canonical reducer：

```text
deriveTeamRunStatus(run, intents, jobs)
```

### 8.3 Lease 回收

reconcile 时增加：

- claim 已过期且 Job 不再 running：Intent 重新 open；
- claim 已过期但旧 session 仍存活：先 abort，确认 owner token 后再 open；
- Job session 缺失：Intent 标记 retryable failed 或重新 open；
- Intent superseded：所有旧 Job 必须 cancel，迟到 Fact 进入 rejected/stale；
- parent 删除：复用现有 parent-session-guard，同时释放 active claims。

## 9. 题目信息记录方案

### 9.1 信息层次

```text
Challenge metadata
  └─ inventory.md / Evidence.md
Confirmed facts
  └─ .ctf-evidence-board.json + events.jsonl
Routes
  └─ route.json + Evidence.md
Primitive / closure
  └─ primitive.json / closure.json
Intents
  └─ .ctf-evidence-board.json + events.jsonl
Worker attempts
  └─ TeamState + events.jsonl
```

### 9.2 Evidence 投影

Evidence.md 每个 Fact 建议展示：

```text
[F-001] confirmed / R1 / source=job-002
Statement: target is ELF x86-64 with NX enabled
Evidence: file ./chall; sha256:...
Accepted by: ctf-expert
Derived intents: I-003, I-004
```

Intent 展示：

```text
[I-003] running / R1 / worker=job-004
Based on: F-001, F-002
Objective: validate ret2win control flow
Expected: controlled RIP reaches win function
Stop: confirmed control or reproducible failure
```

不要把 Worker 的未经审核长文本直接追加为 Evidence.md 正文。

## 10. 实施阶段

### 阶段 0：协议与边界（1 个 PR）

- 在 `team-types.ts` 定义 Fact、Intent、Event、packet 类型；
- 扩展 `TeamState`，版本保持兼容并增加可选字段；
- 增加 schema 校验和长度限制；
- 保留现有 Push dispatch 行为；
- 增加固定 packet parser 单测。

验收：非法 packet、无来源 Fact、无 evidence、错误 route、超长内容和重复 ID 均被拒绝或幂等处理。

### 阶段 1：Fact 增量回流（优先）

- 在 `collect` 中引入 cursor；
- 统一解析 worker packet；
- pending Fact 写入 board/event stream；
- Expert 通过 `ctf-team-collect` 获取增量 Fact；
- 保留最终文本 fallback；
- Worker 仍不能写 Evidence.md。

验收：Worker 产生两个增量 Fact 时，Expert 两次 collect 不重复；最后文本未携带 packet 时不会产生 confirmed Fact。

### 阶段 2：Push Job 内部 Intent 化

- `ctf-team-dispatch` 创建 Intent；
- 指定 worker 自动 claim；
- TeamJob 保存 `intentId` 和 claim token；
- cancel/retry/recover 同时更新 Intent；
- 旧 job 数据通过 migration 生成 synthetic Intent，`createdBy="migration"`。

验收：旧 dispatch 调用行为不变；超时、取消、重启恢复和 replacement worker 不会丢失 Intent 关联。

### 阶段 3：开放 Intent Pool 与并发认领

- 增加 `claimNextIntent`；
- 实现 claim lease、renew、过期回收和 fencing；
- 增加 capability 匹配与 route 并发限制；
- 支持 `exclusive/parallel/speculative`；
- Expert 可 supersede、释放和重排 Intent。

验收：两个并发 claim 只有一个 exclusive 成功；旧 token 不能提交 Fact；worker 崩溃后 Intent 可重新认领；不同 Intent 可并发运行。

### 阶段 4：Expert Fact-driven loop

- 更新 `agents/ctf-expert.md` 和 `skills/ctf-expert/SKILL.md`；
- Expert 每轮先处理 pending Fact，再创建 Intent；
- Intent 强制记录 Fact 引用和停止条件；
- live/confirmed closure 后自动取消无关 Intent；
- Evidence.md 展示 Fact → Intent → Job → Result 链路。

验收：没有 Fact 引用的非初始 Intent 被拒绝；confirmed Fact 可产生下一轮 Intent；superseded Fact 的 Intent 被标记 superseded 或重新基于新 Fact 创建。

## 11. 测试方案

### 单元测试

- Fact/Intent/Event schema；
- packet 解析与重复 ID；
- Intent 状态迁移；
- claim lease 过期；
- owner token fencing；
- Fact acceptance/rejection/supersede；
- run status 单一派生函数。

### 集成测试

扩展现有 `test/team-lifecycle.integration.test.ts`：

- Push dispatch 自动生成 Intent；
- 多 Worker 并发认领不同 Intent；
- 两个 Worker 抢同一 exclusive Intent；
- Fact 增量回流和 cursor；
- 无效 packet 不污染 Evidence；
- timeout/retry 保留 intentId；
- cancel-route supersede 未完成 Intent；
- parent 删除释放 claim；
- restart 后恢复 open/claimed/running Intent。

### 最小真实集成 smoke

现有 lifecycle 测试主要使用 fake OpenCode client，适合状态机测试，但不能覆盖真实 SDK 协议。增加一个最小真实 adapter smoke，验证：

- session.create 返回值映射；
- promptAsync 启动；
- session.messages 增量读取；
- session.idle 触发回流；
- abort 后不会继续提交有效 Fact。

不需要把完整 Team 生命周期改成网络测试。

## 12. 风险与防护

### 风险：Fact 洪泛

限制单 Worker、单 Intent、单 Run 的 packet 数量和大小；超限后转为 dropped diagnostic，不阻塞 reconciler。

### 风险：Worker 自报 confirmed

Runtime 强制把 Worker 的 `confirmed` 降为 `pending/observed`；只有 Expert accept 事件可以产生 confirmed。

### 风险：迟到结果复活旧任务

所有 Fact/Intent result 携带 `intentId + claimToken + jobId`；token、状态和 owner 不匹配时写入 stale event，不修改活动状态。

### 风险：重复账本

Intent、Fact 只在 TeamState/board/event stream 中有 canonical 记录；Markdown 和专用 JSON 都是投影，不允许各自定义事实。

### 风险：并发派发过量

复用现有 Team worker 上限、route 限额、request budget、deadline 和 retry 限制；Intent Pool 不能绕过 Expert policy。

### 风险：Agent 入口扩大

Worker 不获得 `ctf-team-dispatch`、`ctf-team-intent` 的管理权限；只有 Expert/parent session 能创建、取消、supersede Intent。

## 13. 完成标准

实现完成时必须满足：

- Expert 能记录题目基础信息并持续维护 Evidence；
- Worker 只能提交带来源和 evidence 的 pending Fact；
- Expert 能接受/驳回 Fact，并基于 Fact 创建 Intent；
- Intent 必须可追溯到 Fact、Route 和题目 Run；
- 多个 Intent 可并发执行；
- exclusive Intent 的 claim 原子且不会双重认领；
- Worker 崩溃、超时、取消、重启后 claim 能正确回收；
- stale Worker 不能覆盖新 Worker 的结果；
- 现有 Push dispatch 兼容；
- Evidence.md 能看到 Challenge → Fact → Intent → Job → Result 链路；
- 真实 solve 结果仍由独立 flag/file/service oracle 判定；Fact 和 Intent 不能冒充 solve 成功；
- 结构化 packet 失败不会破坏现有最终文本 collect fallback；
- Team Mode 的核心生命周期代码继续复用现有锁、状态持久化、retry 和 parent cleanup 实现。

## 14. 最终决策

最稳妥的实现顺序是：

```text
先做 Fact 增量回流
  → 再让现有 Push job 内部生成 Intent
  → 再开放 claim lease
  → 最后启用 Worker Pull 和 Expert 动态重规划
```

不要第一步就把现有 `ctf-team-dispatch` 删除并重写成开放队列。当前生命周期底座已经解决了最难的 session、retry、cancel 和 recovery 问题；改造重点应是给这套底座增加结构化信息流和可追溯的 Intent 语义，而不是再复制一套 worker 生命周期。
