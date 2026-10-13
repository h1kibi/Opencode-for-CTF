# Tool 层瘦身与收敛方案

## 1. 审计结论

当前 `tools/` 不是单纯的工具目录，而是把以下几类东西混在同一自动注册树中：

- 面向 agent 的用户工具；
- family 专用工具；
- 维护/诊断/迁移工具；
- 兼容 alias；
- 可被其他工具 import 的实现模块；
- 仅供脚本或人工使用的工具；
- Python 外部 helper。

现状规模：

- `tools/` 共 **209 个文件**：208 个 TypeScript/JavaScript + 1 个 Python；
- 其中 `tools/lib/` 有 **20 个 helper**，不会注册为工具；
- 自动注册树有约 **171 个工具名**；
- `ALL_TOOL_PACKS` 有 **17 个 pack**，默认启用 **8 个 pack**；
- 最大文件包括 `ctf-decision-state.ts`（约 66KB）、`ctf-multimodal-triage.ts`（约 53KB）、`ctf-env-check.ts`（约 45KB）；
- `tools/core/archive-safe-extract.ts`（337 行）和 `tools/core/ctf-safe-extract.ts`（546 行）是两套完整的 archive 解压实现；
- 注册机制在 `src/ctf-tools.ts:79-119,167-255`，递归发现 tools 下所有 `.ts/.js`，按 basename 变成独立工具；`tools/lib` 虽被排除，但所有其他“内部文件”都会暴露。

**主要问题不是代码数量本身，而是边界错误：**文件存在即成为 agent 可见入口，导致工具、别名、诊断脚本、兼容层和半成品都进入同一产品面。

目标不是把所有功能揉成一个巨型工具，而是：

1. 缩小默认可见工具集合；
2. 只保留真正可独立调用的入口；
3. 复用底层实现，删除平行实现；
4. 让 specialist 工具按需加载；
5. 把维护/诊断/迁移代码移出自动发现树；
6. 让每个工具承担一个清晰、可验证的动作。

---

## 2. 现状架构与根因

### 2.1 自动发现放大了目录膨胀

`src/ctf-tools.ts` 递归扫描 `tools/`，只跳过 `tools/lib`。任何放在 `tools/core`、`tools/web`、`tools/pwn` 等目录下的 `.ts/.js` 都有机会成为注册入口。

这会导致：

- 兼容 facade 和 canonical 工具同时出现；
- 维护工具被误认为 agent 工具；
- 未来新增一个实现文件就可能扩大公开 API；
- 工具是否可用由文件命名决定，而不是由显式产品清单决定；
- `tool-packs.ts` 需要维护越来越大的 exact-name/prefix 分类表。

### 2.2 Pack 数量与工具数量同时承担多个职责

`src/tool-packs.ts` 同时负责：

- 工具分类；
- 默认可见性；
- family specialist 能力；
- heavy / dynamic 环境能力；
- maintenance 工具；
- 兼容 alias 归类。

因此当前 17 个 pack 不是 17 个清晰的产品能力，而是“分类、负载、权限、环境依赖、历史命名”的混合编码。

### 2.3 重复入口与完整重复实现

已确认：

- `archive-safe-extract.ts` 与 `ctf-safe-extract.ts` 各自实现 archive 类型判断、危险路径检查、列目录、解压、文件遍历；后者有更完整的 ZIP header recovery、flag candidate、binary hint，应成为唯一 canonical archive 工具；
- `ctf-java-analyze.ts` → `ctf-java-analyze-pack.ts`；
- `ctf-web-analyze.ts` → `ctf-web-recon-pack.ts`；
- `ctf-pwn-remote-check.ts` → `ctf-pwn-remote-fingerprint.ts`；
- `src/tool-metadata.ts:15-20` 已登记这些 alias，但 `src/tool-packs.ts` 仍将 alias 当作独立精确名称管理。

### 2.4 通用 helper 被反复复制

已确认存在以下重复族：

- `printableStrings`：`ctf-binary-probe`、`ctf-one-shot-triage`、`ctf-elf-slice`、pcap/stego probe、PE slice、unicorn helper、Android triage 等；
- `entropy`：`tools/lib/triage-core.ts`、`tools/lib/pe-utils.ts`、REV slice；
- `readSample`：triage-core、REV unicorn helper；
- `firstDevice`：三个 Android 工具各自实现；
- `collectFiles`：archive 两套实现、`ctf-flag-grep`、`ctf-one-shot-triage`；
- `uniq`：Pwn disassembly 与 VM helper；
- `tools/web/ctf-web-recon-pack.ts` 还有一层仅转调 `tools/lib/web-http.ts` 的 `unique` 包装。

这些不是都能机械合并。不同调用者有不同上限、offset、最小长度和输出格式；应共享底层 primitive，通过显式参数保留差异，而不是强行统一外层结果。

---

## 3. 目标架构

### 3.1 入口白名单替代全目录自动暴露

将 `src/ctf-tools.ts` 从“扫描即注册”改为“两步模型”：

```text
tools/ 实现目录
  -> explicit tool manifest（唯一公开入口）
  -> pack/filter/permission
  -> dynamic import
  -> registry
```

建议目录约定：

```text
tools/
  public/       # 可作为 agent 工具的入口，必须显式列入 manifest
  internal/     # 仅被 import 的实现，不注册
  lib/          # 纯 helper
  adapters/     # 外部命令、Docker、Python、WSL 适配器
```

不必一次性移动 209 个文件。第一步可保留现有目录，新增 `src/tool-manifest.ts` 或 `ctf-agent.manifest.json` 的 `registered_tools` 显式清单；发现器只加载清单中的文件。未进入清单的工具不再自动成为 registry 工具。

**不变量：**新增文件不会自动扩大产品 API；删除 manifest 项才是有意的 breaking change。

### 3.2 将工具分成三种可见性

| 类型 | 例子 | 是否进入 agent registry | 默认加载 |
|---|---|---:|---:|
| Core public | route、triage、evidence、flag oracle | 是 | 是 |
| Family specialist | pwn/web/rev/android/forensics heavy | 是 | 否，按 family/pack |
| Internal/maintenance | doctor、index audit、asset migration、低层 adapter | 否 | 仅脚本 import |

`tools/lib` 继续作为 internal helper；`tools/core` 不应再天然等于 public。

### 3.3 收敛 pack

目标从 17 个 pack 收敛为 5 个产品层级：

1. `core`：路由、基础 triage、证据、oracle、文件安全；
2. `web`；
3. `pwn`；
4. `rev`（含 Android/Java/Godot 作为按需 specialist 子集）；
5. `forensics` / `crypto` / `aisec` 可暂时保留为 family pack，但 heavy/dynamic/maintenance 不再作为独立用户 pack。

实际推荐的最小兼容路径：先保留 family pack ID，内部将 `*-heavy`、`*-dynamic` 映射成 capability flags，而不是继续扩展 pack 数：

```ts
type ToolCapability = "core" | "web" | "pwn" | "rev" | "android" | "heavy" | "network" | "docker"
```

Pack 表达“谁能看见”，capability 表达“工具需要什么环境”。两者不要混用。

### 3.4 一个动作一个入口

用户可见工具应该满足：

- 输入和输出协议稳定；
- 能独立说明用途；
- 有明确失败语义；
- 不只是另一个工具的别名或同义包装；
- 不把多个互不相关的动作塞进 `action` 大 enum。

反例：同一 archive 动作暴露两个完整入口；同一 remote fingerprint 暴露 canonical + check；工具仅为环境探测、索引维护或内部迁移服务，却被自动注册。

---

## 4. 分阶段清理计划

### P0：立即收敛公开面（低风险）

#### P0.1 保留唯一 canonical archive 实现

以 `tools/core/ctf-safe-extract.ts` 为唯一实现。处理顺序：

1. 将 `archive-safe-extract` 降为短期 alias（如果仍承诺旧调用者兼容），不再作为默认 registry 工具；
2. 把旧入口从 `CORE/MAINTENANCE` exact tool 集合移除；
3. 将所有内部文档、agent、测试和 manifest 指向 `ctf-safe-extract`；
4. 记录 alias 命中指标或一次性 warning；
5. 在下一个明确 breaking release 删除 alias 和旧 metadata。

如果没有外部安装用户或稳定 API 承诺，可直接删除 `archive-safe-extract.ts`，但必须先确认 npm 包和安装器不会复制/引用该文件。

#### P0.2 兼容 alias 不注册为独立工具

`ctf-java-analyze.ts`、`ctf-web-analyze.ts`、`ctf-pwn-remote-check.ts` 目前是薄 facade。不要让目录发现器把它们加载成独立工具：

- canonical registry 只登记实际实现：`ctf-java-analyze-pack`、`ctf-web-recon-pack`、`ctf-pwn-remote-fingerprint`；
- 旧名字在调用入口层做 alias resolution，解析到 canonical name；
- `compat_aliases` 只保留在 alias resolver，不进入工具数量、pack 工具列表和能力统计；
- 统一 alias 方向，修复当前 wrapper prose 与 `COMPAT_ALIASES` 方向不一致的问题。

若公开面已经完成迁移，则删除 facade 文件、metadata alias、alias 测试和旧 manifest 名称，执行 clean cutover。

#### P0.3 取消未被 agent/skill 使用的 specialist 默认注册

以下工具已在 agents/skills 文本中找不到实际调用指引，应先从默认 manifest 移除，而不是立即删除实现：

- `ctf-godot-resource-read`、`ctf-godot-pack-inspect`、`ctf-godot-gdc-scan`、`ctf-godot-decompile`；
- `ctf-ecdsa-attack`、`ctf-prng-attack`、`ctf-rsa-attack`；
- `ctf-web-observe`、`ctf-web-xxe-closure`、`ctf-web-blind-sqli`、`ctf-file-read-via-parser`、`ctf-source-map-read`；
- `ctf-media-open`、`ctf-stego-triage`、`ctf-pcap-extract`。

注意：这只是“未在 agent/skill 文本被引用”，不是证明全仓无调用。先查 manifest、脚本、测试和外部配置；没有引用后再删除。

### P1：合并重复底层实现

#### P1.1 建立 `tools/lib/archive-utils.ts`

抽取：

- `archiveKind`；
- archive member 名称清洗；
- 危险路径判断；
- bounded walker；
- 后端选择和统一错误类型。

保留 `ctf-safe-extract` 的业务层：ZIP local-header recovery、flag pattern、binary hints、输出 schema。不要把增强版降级成旧版的最小交集。

#### P1.2 收敛 triage primitives

以 `tools/lib/triage-core.ts` 为基础，提供参数化 API：

```ts
printableStrings(bytes, { minLength, maxResults, offset })
entropy(bytes, { sampleLimit })
readSample(file, { maxBytes, offset })
```

迁移顺序：core binary/one-shot → forensics → rev → Android。每迁移一个族，删除本地 duplicate；offset、最小长度、上限必须成为参数，而不是复制函数。

#### P1.3 Android 共用设备发现

将 `firstDevice` 放入 `tools/lib/android-device.ts`，由：

- `ctf-android-dynamic-macro.ts`；
- `ctf-android-runtime-check.ts`；
- `ctf-android-runtime-doctor.ts`

共同消费。设备不存在、多个设备、unauthorized 的处理要在共享 helper 中统一。

#### P1.4 统一 bounded file walker 与 unique

只统一边界行为明确的 helper：

- `walkFiles(root, { maxDepth, maxFiles, skipDirs })`；
- `uniqueNonEmpty(values)`。

`ctf-flag-grep`、archive extractor、one-shot triage 若输出/过滤语义不同，不要为了减少文件而强行共用高层函数。

### P2：拆分巨型工具，但不增加入口

优先拆内部实现，不拆公开工具名：

- `ctf-decision-state.ts`（约 66KB）：状态 schema、读写、迁移、格式化拆到 `tools/lib`，保持一个 public action surface；
- `ctf-multimodal-triage.ts`（约 53KB）：媒体探测、OCR/解码适配、结果聚合拆出 internal modules；
- `ctf-env-check.ts`（约 45KB）：检查定义、平台执行器、报告格式拆开；
- `ctf-evidence-board.ts`（约 38KB）：schema、repair、mutation、render 拆开；
- `ctf-pwn-gdb-snapshot.ts` / `ctf-pwn-docker-runner.ts`：环境生命周期和输出解析拆为 adapters。

拆分只移动内部逻辑，不增加工具数量。

### P3：清理无调用实现

经过 P0 manifest 隔离后，再对以下候选做全仓引用确认：

- Godot 4 个工具；
- crypto attack 3 个工具；
- 未被 agent/skill 调用的 web/forensics specialist；
- 未被任何入口引用的工具模板和历史工具。

删除条件必须同时满足：

1. 不在 `ctf-agent.manifest.json` required/optional 工具列表；
2. 不在 agents、skills、commands、scripts、tests、package files 中引用；
3. 不被其他工具动态拼接名称或 `import()`；
4. 不属于公开兼容 alias；
5. 不承担 doctor、installer、benchmark 或 migration 的真实路径。

---

## 5. 建议的 manifest 结构

在 `ctf-agent.manifest.json` 增加显式入口，而不是让目录自动决定公开面：

```json
{
  "registered_tools": {
    "core": [
      "ctf-route-plan",
      "ctf-one-shot-triage",
      "ctf-decision-state",
      "ctf-evidence-board",
      "ctf-safe-extract",
      "ctf-artifact-analyze",
      "ctf-flag-oracle"
    ],
    "web": ["ctf-web-analyze", "ctf-web-source-map"],
    "pwn": ["ctf-pwn-probe", "ctf-pwn-runner"],
    "rev": ["ctf-rev-analyze", "ctf-rev-live-memory-dump"],
    "forensics": ["ctf-forensics-analyze", "ctf-pcap-probe"],
    "crypto": ["ctf-crypto-analyze"],
    "aisec": ["ctf-aisec-analyze"]
  },
  "internal_tools": [
    "ctf-runtime-selftest",
    "ctf-lesson-index-audit",
    "ctf-file-write-matrix"
  ]
}
```

现有 `required_tools` / `optional_pack_tools` 可以作为迁移输入，但必须解决两者语义混杂：required 表示启动必需，optional 表示可加载能力，不应同时充当“磁盘存在性清单”。

### 注册器必须拒绝未声明工具

推荐行为：

- manifest 中声明但文件不存在：启动报告明确 error；
- 文件存在但未声明：不注册，仅在 developer diagnostics 中列出；
- alias 被调用：解析到 canonical，并在报告中标记 compatibility；
- internal 工具被 agent 请求：明确拒绝，不进行动态兜底加载；
- duplicate basename：启动失败，而不是选择第一个。

---

## 6. 度量与验收

瘦身不能只看文件数。建立以下指标：

### 产品面指标

- registry 可见工具数：约 171 → 第一阶段目标 ≤ 80，最终目标按实际 agent workflow 再定；
- 默认加载工具数：只保留 core + 当前 family 的轻量工具；
- compat alias 在 registry 中的数量：目标为 0（alias resolver 中可有，但不作为独立工具）；
- 未声明文件自动暴露数：目标 0。

### 代码质量指标

- 完整重复 archive 实现：2 → 1；
- `firstDevice` 实现：3 → 1；
- triage primitives 的本地复制：逐步收敛到 `tools/lib`；
- 超过 30KB 的 public tool：只保留稳定 orchestration，内部逻辑迁出；
- 维护/诊断工具进入 agent registry：目标 0。

### 行为验收

每一步都必须验证：

1. `/ctf` 默认路由仍能找到 core 工具；
2. 六个主要 family 的首个 triage 路径仍能加载；
3. canonical archive 工具对危险路径、正常 ZIP、flag candidate 的行为不变；
4. Java/Web/Pwn canonical 入口可用；
5. 旧 alias 若保留，解析结果与 canonical 完全一致；
6. 未声明工具不会进入 registry；
7. dynamic/import failure 的错误信息包含工具名和 manifest 来源；
8. package build、installer、tool registration contract 通过；
9. Windows、Docker、Android 等环境不可用时只影响对应 specialist，不阻塞 core registry。

---

## 7. 实施顺序与风险控制

### 第一批（低风险，建议先做）

- 引入 manifest 白名单但先生成兼容清单，默认行为与现状对齐；
- 将 maintenance/diagnostic 工具标记 internal；
- 将 alias 从 registry 统计中排除；
- 删除 P0 中确认全仓无引用的死入口；
- 修正 `check-rev-android-readiness.ts` 这类失效检查的路径/清单，不让错误诊断伪装成工具缺失。

### 第二批（中风险）

- `ctf-safe-extract` 统一 archive 实现；
- triage、Android device、bounded walker、unique helper 合并；
- 将 specialist 工具从默认 pack 移入按需加载；
- 拆分最大 5 个 public 文件的内部实现。

### 第三批（高风险）

- 删除兼容 alias facade；
- 删除旧 flag/session/evidence schema 支持；
- 删除 legacy asset path、旧 WIREMCP 配置和历史 benchmark parser；
- 这些必须在 release notes 明确 breaking change，并提供一次性迁移工具或明确拒绝旧状态。

### 不建议的做法

- 不要只按文件大小删除工具；大型 orchestrator 可能是核心入口；
- 不要把所有工具合并成一个 `ctf-tool(action=...)` 巨型入口；会降低权限、错误和发现性；
- 不要把 alias 直接硬删而不搜 manifest/安装器/外部配置；
- 不要把未被 agent/skill 文本引用直接等同于全仓未使用；先查动态加载和脚本；
- 不要为了统一 helper 改变 offset、上限、超时或输出 schema；先写清边界，再迁移。

---

## 8. 推荐的首个 PR 范围

首个 PR 不要重构全部 209 个文件，只完成以下可验证切片：

1. 增加显式 `registered_tools` manifest；
2. 注册器只加载 manifest，未声明文件仅报告、不注册；
3. 先将当前实际 agent/skill required 工具加入 manifest，保证 core/family 首路径；
4. 将四个兼容 alias 从 registry 可见列表和 pack 统计中排除；
5. 将 `archive-safe-extract` 标记为 deprecated compatibility，不再默认加载；
6. 抽取 `triage-core` 的一个最小 primitive（先迁移 `printableStrings` 两个调用者）；
7. 增加注册报告：registered / deferred / alias / undeclared / missing；
8. 运行 typecheck、tool registration contract、installer 和六个 family 的最小 smoke。

这个切片直接减少 agent 看到的工具面，不依赖一次完成所有 helper 重构，也不会冒险删除仍可能被旧用户调用的迁移逻辑。

## 9. 最终目标

工具层从“目录里有什么就暴露什么”变成“明确声明什么才是产品工具”：

- public 入口少而稳定；
- specialist 按需加载；
- alias 不占独立工具名；
- maintenance 不进入 agent registry；
- 共享 primitive 只有一份；
- legacy 兼容代码有明确边界和删除版本；
- 工具数量、pack 数、registry 报告都反映真实能力，而不是历史文件累积。
