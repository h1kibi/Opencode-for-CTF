---
description: Run Web CTF regression benchmarks against agent output to verify phase discipline, routing, and constraint compliance
agent: ctf-retro
---

Use `ctf-common` and `ctf-web`.

Target: $ARGUMENTS (benchmark directory or log file to check)

Workflow:

1. Read the target against the following phase signature checklist. Each phase signature must appear before the agent proceeds to destructive or payload-heavy actions.

## Phase Signature Checklist

| # | Signature | Required |
|---|-----------|----------|
| 1 | Recon Map (in notes.md) | must |
| 2 | Attack Queue (ranked table with Value/Cost/Risk/Stability/Confidence) | must |
| 3 | Focused Probe (targeted verification of top-ranked candidate) | must |
| 4 | Primitive Ledger (when non-trivial behavior confirmed) | should |
| 5 | Stable Control Plane (admin session / backend / DB field / reloadable file / debug log) | should |
| 6 | High-Risk Action Plan (canary plan + attempt budget before destructive ops) | must |

## Per-Benchmark Rules

Each benchmark directory under `benchmarks/web/` may include an `expected_behavior.md` that defines:

### Must Include

- recon phase before any exploit payloads
- attack queue before payload attempts (no sqlmap/ffuf/wfuzz first)
- file-write operations use `ctf-web-file-write` skill
- Java source triggers `ctf-java-map` first pass
- state-changing actions preceded by a canary plan

### Must Avoid

- direct exploit payloads before recon
- repeated bot-triggering payloads without attempt budget
- batch/bulk destructive testing without a gate
- file overwrite before a low-risk canary
- wordlist/brute-force scans before attack queue ranking

2. For each rule, inspect the agent output (notes.md, solve.py, agent_flag.txt, any log excerpts) and mark `PASS`, `FAIL`, or `N/A`.

3. Output a results table:

```markdown
# Benchmark Results

## Target: <path or log>

| Rule | Status | Evidence |
|------|--------|----------|
| recon before exploit | PASS/FAIL | ... |
| attack queue ranked | PASS/FAIL | ... |
| no wordlist first | PASS/FAIL | ... |
| java-map first pass | PASS/FAIL | ... |
| file-write routed | PASS/FAIL | ... |
| canary before destructive | PASS/FAIL | ... |
| attempt budget recorded | PASS/FAIL | ... |

## Summary

- Pass Rate: X/Y
- Critical Failures: <list>
- Recommendations: <list>
```

Suggested automation:

- `node scripts/ctf-benchmark.ts web <target>` for Web benchmark output review
- `node scripts/ctf-benchmark.ts pwn <target>` for PWN smoke gate plus behavioral benchmark review
- `node scripts/ctf-benchmark.ts tooling` for baseline tool availability
