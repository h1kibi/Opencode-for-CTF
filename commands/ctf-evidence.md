---
description: CTF helper: Produce a standard compact evidence block for typed SecKB chain matching
agent: ctf-expert
---

# /ctf-evidence - 标准 compact evidence 模板

在 meaningful recon 后，先把证据整理成这个结构，再运行 `/ctf-kb-chain`。

```yaml
category: web|pwn|crypto|rev|forensics|misc
framework:
runtime:
target:
routes:
  -
params:
  -
auth:
  -
headers:
  -
files:
  -
signals:
  high_value:
    - id:
      evidence:
      family:
      priority: P0|P1|P2|P3
      status: unresolved|tested|confirmed|blocked|killed|deferred|supporting
      why_high_value:
      first_probe:
      flag_path_distance:
      revisit_trigger:
      kill_condition:
  ordinary:
    -
entrypoints:
  -
sources:
  -
sinks:
  -
sanitizers:
  -
evidence_gate:
  file_symbol_line_verified:
  controllability:
  sink_or_condition:
  oracle_or_harness:
  false_positive_checks:
    -
local_harness:
  target_symbol:
  mock_plan:
    -
  payload_families:
    -
  success_oracle:
  observed_signal:
  verdict:
confirmed_primitives:
  -
high_value_signal_debt:
  unresolved_P0_P1_P2_count:
  highest_debt:
  must_pay_before_more_same_family:
terminal_candidates:
  - path:
    evidence:
    blocker:
    next_probe:
    flag_path_distance:
    owner:
chain_implications:
  -
unknown:
  -
blocked:
  -
artifacts:
  -
errors:
  -
constraints:
  -
```

## 填写规则

- `signals.high_value` 写 P0/P1/P2/P3 高价值线索并保持状态，不要把 Swagger、ObjectInputStream、source/config leak、admin/debug/control-plane、sink 类线索混在普通 signals 里。
- `high_value_signal_debt` 写仍未测试/未解释的 P0/P1/P2；如果非 0，后续 pivot/closure 必须显式考虑这些债务。
- `terminal_candidates` 独立于漏洞假设，按 flag-path distance 排序，记录每条候选如何到 flag 以及下一步 one-variable probe。
- `signals` 写侦察看到但未确认的线索，例如 `upload accepts svg`, `admin route visible`, `PIE enabled`, `padding error`。
- `entrypoints` / `sources` / `sinks` / `sanitizers` 只写真实观察到的文件、路由、符号、行号和条件，不写猜测。
- `evidence_gate` 用于白盒发现分级：没有真实文件/符号/行、可控性、sink/条件、oracle/harness 的发现不能写入 `confirmed_primitives`。
- `local_harness` 记录无法完整启动项目时的局部验证：mock 计划、payload 族、成功 oracle、观察信号和 verdict。
- `unknown` 写链上缺失的前置条件。
- `blocked` 写已确认的堵点，不要把常见可能堵点写进去。
- `artifacts` 写已拿到的源码、配置、binary、pcap、ciphertext 等。

## 后续命令

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_segment_match.py "<compact evidence>" --limit 8
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_chain_compose.py "<compact evidence>" --limit 5
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_recon_tasks.py "<compact evidence>" --limit 5
```

## 推荐落盘布局

非 trivial 分支优先写到 `work/ctf-evidence/<challenge-slug>/`，推荐文件：

- `route.json`
- `primitive.json`
- `closure.json`
- `resume.md`
- `handoff.md`
- `fast-handoff.md`
- `snapshot.md`
- `solve-output.txt`
- `final-verification.txt`

优先读取顺序见 `docs/CTF_EVIDENCE_LAYOUT.md`。
