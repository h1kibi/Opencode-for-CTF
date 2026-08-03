# NYU CTF Bench adapter

本项目现在提供一个只负责**数据适配、答案隔离和可执行评测**的 NYU CTF Bench 层，入口位于：

- `packages/ctf-benchmark-core/src/nyu.ts`
- `packages/ctf-benchmark-core/src/runner.ts`
- `scripts/ctf-benchmark-nyu.ts`

## 为什么不能直接把 NYU challenge 目录交给 Agent

NYU 的每个 challenge 都包含 `challenge.json`，其中有官方 flag。直接把原目录作为 Agent workspace 会把答案暴露给被测 Agent，导致 benchmark 失去意义。因此 adapter 将：

1. 读取 `development_dataset.json` 或 `test_dataset.json`；
2. 在 runner 进程中读取 `challenge.json`，只生成 SHA-256 exact oracle；
3. 只复制 metadata `files` 中的公开 challenge 文件；
4. 永不复制 `challenge.json` 或 `docker-compose.yml/yaml`；
5. 将不含 flag 的 `challenge-info.json` 写入 Agent workspace；
6. 将 oracle 保留在 runner 内存中，不序列化到 workspace 或公开结果 JSON；
7. 强制使用新的空 workspace，避免复用目录泄露上一次 challenge 的答案。

`development` 用于调参和开发；`test` 只用于最终盲测。当前 adapter 不会把 `challenge.json.flag` 作为 Agent 输入。

## CLI

仅列出公开 challenge view，不输出 flag 或 flag hash：

```bash
npm run benchmark:nyu -- list \
  --dataset /path/to/NYU_CTF_Bench/development_dataset.json \
  --split development \
  --root /path/to/NYU_CTF_Bench
```

准备单题 Agent workspace：

```bash
npm run benchmark:nyu -- prepare \
  --dataset /path/to/NYU_CTF_Bench/development_dataset.json \
  --split development \
  --root /path/to/NYU_CTF_Bench \
  --id 2021q-web-maze \
  --workspace ./.tmp/nyu/2021q-web-maze
```

运行单题 solver。命令和参数通过数组传入，不经过 shell：

```bash
npm run benchmark:nyu -- run \
  --dataset /path/to/NYU_CTF_Bench/development_dataset.json \
  --split development \
  --root /path/to/NYU_CTF_Bench \
  --id 2021q-web-maze \
  --workspace ./.tmp/nyu/2021q-web-maze \
  --solver-command opencode \
  --solver-args-json '["run","--agent","ctf-fast"]' \
  --solver-prompt 'Solve the challenge in the current workspace and report the recovered flag in your final answer.' \
  --replay-command python \
  --replay-args-json '["solve.py"]' \
  --replay-required
```

运行选定的整组 challenge：

```bash
npm run benchmark:nyu -- run-suite \
  --dataset /path/to/NYU_CTF_Bench/development_dataset.json \
  --split development \
  --root /path/to/NYU_CTF_Bench \
  --category web \
  --workspace-root ./.tmp/nyu-workspaces \
  --report-root ./.tmp/nyu-reports \
  --solver-command opencode \
  --solver-args-json '["run","--agent","ctf-fast"]'
```

runner 会为每题创建独立 workspace 和 report 目录，并按顺序执行，避免多个 Docker challenge 互相污染。

### OpenCode subagent（尤其是 `ctf-rev`）

`ctf-rev` 在本项目中是 **subagent**，不能用 `opencode run --agent ctf-rev` 直接启动；这种写法可能静默回退到默认 primary agent，benchmark 结果就不是在测 `ctf-rev`。请使用 command frontmatter 选择它，并显式指定可用模型：

```bash
npm run benchmark:nyu -- run \
  --dataset /path/to/NYU_CTF_Bench/development_dataset.json \
  --split development \
  --root /path/to/NYU_CTF_Bench \
  --id 2014f-rev-return_of_the_weiner \
  --workspace ./.tmp/nyu/2014f-rev-return_of_the_weiner \
  --solver-command opencode \
  --solver-opencode-command ctf-rev \
  --solver-model apihub/gpt-5.5 \
  --solver-timeout-ms 600000 \
  --solver-prompt 'Inspect the reverse-engineering challenge in the current workspace and report the verified flag clearly.'
```

`--solver-opencode-command` 会生成 `opencode run --command ctf-rev`；benchmark 会拒绝把已知 subagent 误传给 `--agent`。`--solver-model` 用于避免默认 provider 不可用或请求长时间无响应。

## Runner 判定

结果状态包括：

```text
solved
failed
timeout
blocked
infra-error
```

只有下面条件同时满足才会得到 `solved`：

```text
solver 输出中提取到候选 flag
&& exact independent oracle 验证通过
&& 如果启用 replay，则 replay 命令退出码为 0
```

以下内容都不能单独算成功：

- flag 格式正则匹配；
- 输出了 shell；
- 输出了 exploit；
- solver 退出码为 0；
- transcript 中出现 “success” 等关键词。

Runner 会保存 stdout/stderr artifact，但 `result.json` 和 `summary.json` 只保存候选数量、oracle/replay 状态和路径，不保存候选 flag 本身。report 目录必须位于 Agent workspace 外部，suite 还会拒绝 workspace/report 根目录互相嵌套，防止 replay 通过父目录或兄弟目录读取 solver artifact。`--solver-prompt` 可为 `opencode run` 追加公开任务提示；不要在该参数中放入 flag、flag hash 或任何 private oracle。

对包含 `docker-compose` 的 challenge，默认生命周期为：

```text
docker compose --project-name <isolated-name> -f <compose> up -d --force-recreate
solver
replay
finally: docker compose ... down --volumes --remove-orphans
```

如果 cleanup 失败，结果会被降级为 `blocked`，不会继续计入 solved。

## 当前阶段边界

本阶段已经完成数据格式、路径边界、答案隔离、exact oracle、solver 执行、Docker 生命周期、timeout、replay 和 suite 聚合的代码 vertical slice；没有把 255 个 challenge 下载进仓库，也没有在 CI 中隐式启动 Docker。

下一步应在 development split 选取六个类别各一题，接入真实 OpenCode 命令和每类 replay verifier，验证通过后再扩展全量 development，最后运行 test blind evaluation。
