---
name: ctf-aisec
description: Use for authorized AI-security CTF challenges involving LLM agents, prompt injection, model artifacts, adversarial ML, data poisoning, model extraction, RAG/tool boundaries, or unsafe model serialization.
compatibility: opencode
---

# CTF AI Security

Use this as the AI-security specialist **control layer**. Load `ctf-misc-ai-ml` for technique references and payload-independent attack guidance; do not duplicate its long playbooks here. The specialist remains routed under `misc`, is dispatched by `ctf-expert`, and returns evidence rather than owning global state.

## Load When

Load when an LLM, agent, tool-use policy, prompt/template, RAG pipeline, tokenizer, dataset, model/adapter/weights file, inference API, adversarial-example objective, poisoning objective, extraction objective, or model serialization boundary is central to the challenge.

## Do Not Load When

Do not use this as a generic web prompt solver, Python jail solver, pure crypto challenge, or native reverse-engineering task where AI terminology is incidental. Hand off once the decisive boundary is clearly owned by Web, Rev, Forensics, Crypto, or ordinary Misc.

## Required Inputs

Collect:

- challenge prompt, files, URLs/hosts explicitly in scope, and artifact hashes;
- model/framework/version, tokenizer/config, dataset/adapter provenance, and wrapper or agent topology;
- input/output oracle, task metric or flag condition, isolation constraints, and available runtimes;
- the strongest observed trust-boundary signal and one uncertainty that could falsify the route.

Never invent an inference endpoint, package version, tool permission, or model behavior.

## First Safe Action

Run the following bounded sequence before mutation:

1. `ctf-misc-analyze` for category confirmation;
2. `ctf-aisec-env-check` for Python/runtime/package capability (read-only; never installs);
3. `ctf-aisec-model-inspect` for model/tokenizer/dataset/serialization fingerprinting;
4. `ctf-artifact-analyze` / `ctf-file-triage` for wrapper and source evidence;
5. one benign baseline through `ctf-aisec-inference-probe` when a local wrapper is available.

Record output shape, determinism, latency, token/context limits, exact metric/oracle, and the hash of every artifact used. Model inspection must precede model loading.

## Environment Matrix

Treat capabilities as a matrix, not a binary prerequisite:

| Capability | Preferred check | Fallback |
| --- | --- | --- |
| Python | `ctf-aisec-env-check` | `ctf-python-inline` with the active launcher |
| NumPy/SciPy/sklearn | package rows from env check | small standard-library/NumPy-only metric script |
| PyTorch/Transformers | package rows from env check | challenge-provided wrapper or static artifact inspection |
| safetensors | package row + header inspection | never substitute unsafe pickle loading |
| ONNX/ONNX Runtime | package rows from env check | static graph/file fingerprinting, then expert-approved runtime |
| GPU/Docker | env check and expert approval | CPU, bounded local process, or no-load analysis |

Missing optional packages produce a degraded route, not an install request. `pip install`, model downloads, GPU use, Docker, and remote services require controller approval.

## Artifact Safety Matrix

| Artifact | Default action | Prohibited default action |
| --- | --- | --- |
| `.safetensors` | parse bounded header, hash, list tensor names | arbitrary code execution or untrusted loading |
| `.pt` / `.pth` / `.pkl` / `.pickle` | fingerprint bytes, identify pickle risk, hand off if needed | `torch.load`, `pickle.load`, or importing attacker-controlled classes |
| ONNX/GGUF | inspect magic, size, metadata, and provenance | executing custom operators or unknown runtimes |
| tokenizer/config JSON | parse bounded JSON and key structure | following tool URLs or downloading referenced assets |
| JSONL/CSV/prompt data | audit duplicates, labels, triggers, provenance | modifying originals or broad exfiltration |
| wrapper/service | benign baseline and one-variable probes | blind jailbreak/payload roulette or unrelated network scanning |

Preserve originals. Keep hashes, relative paths, and the reason for any load/execute escalation.

## Baseline Harness Contract

Every probe should include `input`, `input_hash` when available, `model_or_wrapper_version`, `runtime`, `timeout_ms`, `stdout/stderr` or HTTP status, `response_shape`, `latency_ms`, `determinism`, `metric_or_oracle`, and `oracle_verified`. Change one variable per attempt. Use `ctf-aisec-inference-probe` only with an explicit `{input_file}` argument, bounded input/output, and a local authorized wrapper; it does not provide stdin, shell parsing, or network policy expansion.

## Attack-Family Routing

Choose the smallest falsifiable family:

- prompt/indirect injection, token smuggling, context-window manipulation;
- agent tool-use, MCP authorization, RAG retrieval, document poisoning, and data provenance;
- adversarial examples, evasion, backdoors, poisoning, membership inference, extraction, and LoRA/fine-tuning behavior;
- unsafe model/tokenizer serialization, dependency confusion, and supply-chain boundaries;
- model-logic puzzles where the challenge oracle is the primary success signal.

For technique details, load `ctf-misc-ai-ml` and use pattern/lesson search to derive one next hypothesis. Do not copy payload libraries into this skill or repeat equivalent variants without a metric delta.

## Dispatch / Handoff

- Prompt injection, agent tool use, MCP/RAG boundary, or web-facing wrapper -> `ctf-web` when the application boundary owns the exploit.
- Model file, weights, tokenizer, dataset, or unsafe serialization artifact -> `ctf-forensics` or `ctf-rev` according to the decisive artifact boundary.
- Pure number theory, cryptography, or encoding around the model -> `ctf-crypto` or `ctf-misc`.
- Adversarial input, extraction, poisoning, membership inference, or model-logic challenge -> keep AI Security ownership and measure every attempt against the oracle.
- Missing heavy runtime, GPU, Docker, remote model, or broad probing capability -> escalate to `ctf-expert` with a bounded request and justification.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-aisec | ctf-web | ctf-rev | ctf-forensics | ctf-crypto | ctf-misc
boundary: model | agent | data | wrapper | runtime | unknown
facts: []
uncertainties: []
artifact_and_framework: {}
baseline: { input: "", response_shape: "", latency_ms: [], deterministic: null }
attack_hypothesis: <one falsifiable statement>
metric_or_oracle: <how success is proven>
strongest_signal: <one sentence>
failed_probes: []
next_action: <one bounded input or inspection>
verification: { flag_detected: false, oracle_verified: false }
stop_reason: <required for blocked/dead/close>
```

## Stop Conditions

Stop when the independent oracle verifies the flag, the metric is met, the model is nondeterministic without a usable oracle, the route is disproven, a payload would affect an external system, the artifact would require unsafe deserialization, or the decisive boundary belongs to another specialist.

## Workflow

1. Confirm scope and initialize the worker evidence packet; do not edit canonical `Evidence.md`.
2. Run the safe action sequence and classify the decisive boundary as model, agent, data, wrapper, runtime, or unknown.
3. Establish a benign baseline and preserve exact transcripts/hashes.
4. Load `ctf-misc-ai-ml`; select one attack family and one falsifiable hypothesis.
5. Change one variable per attempt; use `ctf_rag` recall instead of payload roulette.
6. Verify success independently and return the smallest actionable packet to `ctf-expert`.

Do not dispatch or await `researcher`; post-solve maintenance is a manual controller follow-up.
