# 测试与 Benchmark 优化方案

> 审计对象：`test/`、`benchmarks/`、`scripts/*benchmark*`、`packages/ctf-benchmark-core/`、CI 配置。
> 本文审计后已直接删除确认低质的测试；未修改仍有实际行为价值的测试。

## 已执行的删除

已删除以下低价值或形式主义测试：

- `test/artifact-analyze-detection.test.ts`：仅读取 fixture 文本，未执行工具；真实行为覆盖由 `artifact-analyze-context.test.ts` 保留。
- `test/benchmark-scenario-corpus.test.ts`、`test/benchmark-fixture-corpus.test.ts`：仅检查 benchmark 文档、manifest、路径和 schema 存在性。
- `test/benchmark-metadata.test.ts`、`test/cross-reference-integrity.test.ts`、`test/discoverability-crossrefs.test.ts`：重复的 metadata/cross-reference/presence 检查。
- `test/family-benchmark-runners.test.ts`：只读取源码并断言路由字符串存在。
- `test/benchmark-vertical-slice.test.ts`：用同一 flag 生成 hash 再验证，属于自洽测试。
- `test/runtime-dump-script.test.ts`：只断言生成脚本包含/不包含源码字符串。

同时删除 `test/design-fixes.test.ts` 中仅检查 expert tool allowlist 的 `3/4` smoke，以及 `test/tools-web-http.test.ts` 中扫描源码禁止 helper copy 的测试；同文件的 HTTP helper 行为测试保留。

## 1. 结论

当前项目存在两套被当作质量信号、但实际不测解题能力的路径：

1. **source-text / keyword smoke**：读取源码或产物文本，用 `toContain`、正则和文件存在性证明“功能存在”。
2. **scenario checker self-test**：手写 `.scenario/pass` 和 `.scenario/fail` 夹具，反向满足 checker 的关键词规则；测试证明 checker 能识别自己构造的文本，不证明 agent 能完成挑战。

真正具备独立判定能力的是：

- `packages/ctf-benchmark-core/src/oracle.ts` 的精确 hash oracle；
- `test/benchmark-fixture-harness.test.ts` 的真实 checker 子进程、flag mismatch 和 replay 验证；
- `scripts/ctf-benchmark-nyu.ts` / `packages/ctf-benchmark-core/src/runner.ts` 的隔离工作区、solver 子进程和独立 oracle；
- installer、NYU runner、team lifecycle/repair 等真实集成测试。

**核心决策：**把“检查 wiring”与“测运行时行为”分开命名、分开执行、分开计分；删除或降级不能发现真实回归的 smoke；将 benchmark 的通过条件收敛到独立 oracle、可重放的行为轨迹和挑战级结果。

---

## 2. 审计发现与处理原则

### P0：必须先修

| 位置 | 问题 | 处理 |
|---|---|---|
| `test/artifact-analyze-detection.test.ts:14-92` | 名称暗示 integration/detection，但只读取 `test-fixtures/vulnerable-source/*` 并检查字符串，未执行 `ctf-artifact-analyze`。 | 删除该测试或改为 fixture-shape 测试；补一个真实调用工具的行为测试，复用 `test/artifact-analyze-context.test.ts:12-45` 的执行模式。 |
| `test/benchmark-scenario-corpus.test.ts:69-173` | 只验证 manifest、路径、trace schema 和输出文件存在，未运行 checker；文档中的 pass accepted / fail rejected 契约没有被 Vitest 覆盖。 | 抽出可测试的 scenario runner，或用一个受控子进程调用 `scripts/ctf-benchmark-scenarios.ts`，覆盖所有 checked-in family 的 pass/fail。 |
| `scripts/ctf-benchmark.ts` 默认路径 | 默认跑 smoke/scenario，而不是 agent 解题；`npm run check` 只调用 `benchmark:scenarios`。 | 默认检查改名为 `benchmark:contracts`，不将其称为 solve benchmark；真正能力评估单独使用 `benchmark:nyu` 或 challenge fixture runner。 |

### P1：提高判定质量

| 位置 | 问题 | 处理 |
|---|---|---|
| `scripts/check-{web,pwn,rev,crypto,forensics,misc}-benchmarks.ts` | 大多数规则是关键词存在性；例如出现 `notes.md` 即可通过“evidence trail”，出现 `ctf-binary-probe` 即可通过 probe。 | 保留规则引擎作为低成本静态 lint，但不得计入 solve rate；新增负例、语义字段和独立 oracle。 |
| `benchmarks/**/.scenario/pass|fail` | 夹具是针对正则反向构造的自然语言文本，容易被“说出关键词”绕过。 | pass/fail fixture 改为由真实 solver/replay 产出；checker 只读取结构化事件和结果，不从任意 prose 推导完成度。 |
| `test/benchmark-fixture-harness.test.ts` | 目前主要是 synthetic Web fixture，未覆盖各 family legacy rules。 | 每个 family 至少一个真实可执行 fixture：正确解、错误解、缺失证据、顺序错误、伪造关键字。 |
| `test/benchmark-vertical-slice.test.ts:8-16` | 先写 flag，再用同一 literal 计算 hash，属于自洽 tautology。 | 使用预计算常量 hash；分别断言正确候选、近似候选、格式匹配但 hash 错误均有明确结果；与 `benchmark-oracle.test.ts` 合并边界。 |

### P2：清理重复和形式主义测试

- 合并 `benchmark-metadata.test.ts`、`discoverability-crossrefs.test.ts`、`cross-reference-integrity.test.ts` 为一个 cross-reference contract；一次性校验双向引用、family、status 和 orphan ID。
- 替换 `family-benchmark-runners.test.ts:7-31` 的 `existsSync`/源码 `toContain`，改为真实 CLI 调用，至少验证每个 family 的 exit code、空目录策略和错误输出。
- 删除或改名 `runtime-dump-script.test.ts` 的源码字符串断言；优先执行生成脚本并解析输出，无法执行时降级为静态 lint，不称 smoke。
- `test/tools-web-http.test.ts:38-47` 中用于禁止 helper copy 的源码扫描移至 lint/architecture check；不要作为功能测试。
- 合并重复的 tool pack、agent equipment、skill/command presence 测试。保留 schema、路径、link integrity；不要对 prose 断言精确短语。
- `test/design-fixes.test.ts:33-36` 的两个 `toolAllowedForAgent(true)` smoke 删除；把真实 session promotion（`:11-24`）并入 route/session 行为测试。

### 明确保留的高价值测试

不应为了减少数量而降级以下测试：

- `test/installer.test.ts`：真实临时目录、JSONC apply/revert、symlink refusal、upgrade、MCP profile 和 CLI 生命周期；建议拆分，仅改善故障定位。
- `test/nyu-runner.test.ts`、`test/nyu-adapter.test.ts`：solver 子进程、服务生命周期、timeout、cleanup、replay、oracle 和报告脱敏。
- `test/team-lifecycle.integration.test.ts`、`test/team-repair.integration.test.ts`：真实工具对象与持久化状态转换。
- `test/benchmark-empty-dir.test.ts`：空目录必须失败，显式 `CTF_BENCH_ALLOW_EMPTY=1` 才允许跳过，属于有价值的防静默成功保护。
- `test/file-lock.test.ts`、`test/ctf-core.test.ts`、`test/ctf-adapter-opencode.test.ts` 及已有 context-aware tool 行为测试。

---

## 3. 目标测试分层

测试命名和 CI 入口必须表达实际保证，而不是表达愿望。

### L0：纯逻辑单元测试（每次提交）

目标：纯函数、边界和状态转换，快速、确定、无外部进程。

覆盖：oracle 优先级、route reducer、tool visibility、规则解析、notes schema、路径安全。

约束：禁止读源码验证实现；禁止把“字段存在”当成行为断言；每个测试必须包含至少一个能暴露 plausible bug 的反例。

### L1：运行时 contract / wiring（每次提交）

目标：验证导出 API、注册表、manifest、cross-reference、命令路由和错误协议。

可保留 schema/link 检查，但统一命名为 `contract` 或 `integrity`，不计入 benchmark solve rate。

推荐入口：

```text
npm run test:unit
npm run test:contract
npm run check:content
```

### L2：本地行为 smoke（每次提交，受控 fixture）

目标：真正启动被测工具/CLI，输入最小 fixture，观察 stdout、exit code、文件产物和状态变化。

最低要求：每条 smoke 至少有 success、错误输入、边界或拒绝路径之一；不得只检查源码字符串。

推荐覆盖：artifact analyze、family CLI、flag candidate 到 oracle、tool registration 后实际 dispatch。

### L3：集成测试（PR / nightly）

目标：真实子进程、临时工作区、文件锁、installer、team lifecycle、服务生命周期。

隔离要求：所有子进程使用显式最小环境，不直接传播整个 `process.env`；workspace、reportDir、端口和临时文件独立；失败后清理可验证。

### L4：能力 benchmark（nightly / release candidate）

目标：测 agent 是否解决挑战，而不是测 checker 是否接受手写文本。

判定优先级：

1. 独立 exact flag / SHA-256 oracle；
2. challenge-specific verifier（文件、服务或协议结果）；
3. replay 验证可重复关键行为；
4. 结构化 evidence/trace 作为诊断与过程指标，不作为唯一成功判据。

NYU runner 已具备隔离、脱敏和 hash oracle，应作为主基线，而不是把 scenario smoke 当能力基准。

---

## 4. Benchmark 重构

### 4.1 三种类型明确分流

| 类型 | 新名称 | 是否计入能力分 | 目的 |
|---|---|---:|---|
| 静态规则 | `benchmark:lint` | 否 | 检查文档/轨迹格式、危险缺失、开发者反馈 |
| 可重放契约 | `benchmark:replay` | 仅过程指标 | 验证 checker、trace schema、pass/fail wiring |
| 挑战能力 | `benchmark:solve` | 是 | 启动 solver，在隔离挑战中由独立 oracle 判定 |

现有 `scripts/check-*benchmarks.ts` 迁入 `benchmark:lint`；`scripts/ctf-benchmark-scenarios.ts` 迁入 `benchmark:replay`；`benchmark:nyu` 作为 `benchmark:solve` 的第一实现。

### 4.2 结构化结果协议

禁止把任意 notes 文本拼接后跑关键词作为唯一判定。建议每个 challenge 输出：

```json
{
  "challengeId": "ret2win-basic",
  "candidateFlag": "...",
  "artifacts": ["work/evidence.json", "work/solve.py"],
  "events": [
    {"type": "recon", "inputHash": "...", "observed": ["..."]},
    {"type": "exploit_attempt", "result": "success"}
  ],
  "replay": {"command": "...", "exitCode": 0}
}
```

规则：

- `candidateFlag` 只能进入 oracle，格式匹配不能等同 solved；
- `events` 必须来自运行时事件或受信 replay，不接受 agent 自报字符串；
- artifact 路径必须在 workspace 内，内容 hash 用于报告和去重；
- unknown / not-applicable 不计入 pass-rate 分母；缺少必需观测应为 error 或 fail，不能静默 N/A；
- 报告同时记录 `solved`、`formatMatched`、`replayPassed`、`contractPassed`，禁止合成一个含义不清的总分。

### 4.3 防止 benchmark 污染

- pass/fail 样本不得由 checker 规则关键词手写生成；先固定 challenge、输入和 verifier，再生成 solver 轨迹。
- 对每个 checker 做 mutation/negative testing：删除关键事件、替换结果为失败、伪造关键词、调整事件顺序，必须被拒绝或降级。
- challenge secret 不得出现在描述、环境变量、日志和测试 fixture 路径；继续复用 NYU 的 `expectedFlagSha256`、`[REDACTED_FLAG]` 和 sanitized environment 机制。
- 每个 benchmark 记录版本、随机种子、依赖版本、超时、资源限制和数据集 commit；报告可重放。
- 13 个 `benchmarkFamilies` 元数据项必须绑定到至少一个可执行 challenge/replay；`partial`/`planned` 不得被算作 covered。

### 4.4 指标

能力 benchmark 至少报告：

- solve rate（独立 oracle 判定）；
- family/challenge 分项成功率；
- 首次成功率与重试次数；
- wall-clock、token/调用预算、超时率；
- false-positive rate（错误 flag/格式 flag 被拒绝）；
- replay pass rate；
- artifact/evidence 完整度（诊断指标，不替代 solve）。

避免只报告关键词规则通过率、`N/A` 数量或 checker exit code。

---

## 5. CI 与开发入口

现状 `.github/workflows/ci.yml` 只有 Ubuntu/Node 22 quality job；不执行 benchmark scenarios、`check:benchmarks`、NYU、Windows 或服务依赖 smoke。建议：

### Pull Request

```text
npm ci
npm run lint
npm run check:content
npm run format:check
npm run test:unit
npm run test:contract
npm run test:smoke
npm run benchmark:replay
npm run build:plugin
npm run release:check
```

- PR 只使用确定性本地 fixture；总时长目标 5 分钟内。
- 失败输出必须包含 test layer、challenge ID、checker/verifier、exit code 和 artifact 路径。

### Nightly / release candidate

```text
npm run test:integration
npm run benchmark:solve -- --dataset <pinned-dataset>
```

- NYU/服务/Docker 测试单独 job，缓存依赖但不共享 workspace。
- 失败不阻塞普通文档或单元 PR，阻塞 release candidate。
- 增加 Windows job，覆盖 installer、PowerShell/runtime dump、路径和 shell 差异；Linux job 覆盖 Docker/WSL 可用性并明确标记 unavailable，而不是 skip 后算通过。

### 环境与子进程纪律

- 新增 `test/helpers/run-process.ts`：显式构造 env allowlist、cwd、timeout、capture limit、signal/cleanup。
- 禁止新测试直接 `env: process.env`；对现有 benchmark/fixture harness 分阶段迁移。
- 平台不可用时报告 `skipped: unavailable` 与原因；CI 汇总不得把 unavailable 当 solved/pass。
- Vitest 保持全局串行前，优先消除 cwd/global-state 共享；完成隔离后再恢复合理并行度。

---

## 6. 实施顺序

### 阶段 1：止血（P0，1 个 PR）

1. 将 `artifact-analyze-detection` 改为真实执行，或删除并补齐真实行为测试。
2. 让 Vitest 调用 scenario runner，覆盖当前所有 pass/fail；失败时打印 scenario ID。
3. 将现有 `check:*`、scenario 入口和 NYU 入口重新命名/标注，避免把 wiring 结果称为能力结果。
4. 修正 checker 的 N/A 统计：N/A 不进分母；“无有效检查项”必须非零退出或明确 skipped。

**验收：**故意删除 checker 调用、伪造关键词、破坏 pass trace、让 fail fixture 通过时，测试必须失败；默认 `npm run check` 不再声称完成 agent benchmark。

### 阶段 2：建立真实 fixture 能力（P1，2–3 个 PR）

1. 为六个 family 各选一个最小 challenge fixture。
2. 每个 fixture 提供正确解、错误解、格式正确但 hash 错误、关键事件缺失四类结果。
3. 用固定 hash 或 challenge verifier 判定，不从输出 prose 推断 solved。
4. 给 checker 加 mutation/negative suite；把 `benchmark-vertical-slice` 合并到 oracle 边界测试。
5. 替换 family runner source-text 测试为真实 CLI smoke。

**验收：**六个 family 均有可执行成功与失败路径；关键词替换不改变真实判定；错误 flag 永不计 solved。

### 阶段 3：去重与测试分层（2–4 个 PR）

1. 合并 metadata/cross-reference/registry 重复测试。
2. 把 source-text architecture checks 迁移到 lint 或独立 integrity suite。
3. 拆分 installer 超大测试为 install/config/upgrade/uninstall 生命周期，但保持临时目录和顺序隔离。
4. 引入 `test/unit`、`test/contract`、`test/smoke`、`test/integration` 目录或等价 Vitest project labels。
5. 为 workspace package exports/build 增加真实 import/build smoke，尤其是 `ctf-rules-engine`、`ctf-notes-core`。

**验收：**每个测试可归类；重复注册表断言只有一个 canonical matrix；测试失败能指向行为、输入和预期，而非源码短语。

### 阶段 4：能力基线与长期治理

1. 固定 NYU dataset commit 和 benchmark manifest 版本。
2. 每次 nightly 运行 solve benchmark，多次运行报告方差、超时和预算。
3. PR 只运行小型 replay/fixture；release 使用完整 dataset。
4. 增加 benchmark review checklist：独立 oracle、负例、重放、隔离、成本、数据泄漏、指标定义。
5. 每个新增 smoke 必须回答：启动了什么、输入是什么、观察到什么、哪个 plausible bug 会让它失败。

---

## 7. 质量门槛

新增或修改测试必须满足：

- 测试运行时行为，而非只读取实现源码；
- 至少一个负例或边界；
- 判定来自独立预期、固定 hash、真实状态转换或外部 verifier；
- 不把 `toBeDefined`、`toBeTruthy`、任意关键词命中作为唯一重要断言；
- 明确超时、资源、平台和 skip 语义；
- 子进程环境、cwd、临时目录和清理可控；
- benchmark 报告区分 solved / candidate / replay / contract / unavailable；
- 测试名称与实际保证一致：`contract` 不叫 `integration`，`lint` 不叫 `solve`。

### PR 审查问题

1. 如果删掉被测实现而保留同样文本，测试会不会仍然通过？会则不是行为测试。
2. 如果 agent 只输出关键词但没有执行工具，benchmark 会不会通过？会则不能计入能力分。
3. 错误 flag、格式正确的假 flag、空产物是否明确失败？
4. 测试是否验证了失败路径和清理，而不是只验证 happy path？
5. 该测试是否与已有 registry/metadata/skill presence 测试重复？
6. 结果能否在干净机器、固定数据集和隔离 workspace 中重放？

---

## 8. 预期结果

整改完成后：

- `check` 的绿色状态代表类型、内容、单元、contract 和最小行为 smoke 通过，而不是“关键词 checker 自测通过”；
- benchmark 的 solve rate 只由独立 oracle/verifier 产生；
- scenario/replay 保留为 checker 回归保护，但不会冒充 agent 能力；
- 高价值 installer、team、NYU、锁和状态集成测试继续保留；
- 测试数量可以减少，但回归检测能力、失败可诊断性和 benchmark 可信度提高；
- 任何无法接入真实 oracle 的指标都明确标为过程/诊断指标，而不是成功率。
