---
name: ctf-misc-ai-ml
description: Use for AI/ML CTF challenges involving model files, adversarial inputs, prompt injection, LLM agents, model extraction, membership inference, training-data poisoning, LoRA/adapter behavior, neural-network inspection, or unsafe model serialization.
compatibility: opencode
---

# CTF AI/ML

Classify the artifact and threat boundary before selecting an attack. Separate model behavior, application/agent behavior, data leakage, and deployment/runtime issues.

## Load When

Load when a model, tokenizer, dataset, prompt/agent harness, inference API, serialized ML file, or adversarial-example objective is central to the challenge.

## Do Not Load When

Do not load for an ordinary Web prompt field, a generic Python jail, or a native binary whose ML terminology is incidental. Hand off to Web, misc jail, rev, or forensics as evidence dictates.

## Required Inputs

Require model/application artifact, input/output oracle, task metric or flag condition, framework/version if known, isolation constraints, and a hypothesis about the relevant boundary.

## First Safe Action

Fingerprint files and dependencies, inspect model architecture/tokenizer/config and the inference wrapper, then run one benign baseline input to establish output shape and determinism.

## Dispatch / Handoff

- Prompt/agent/MCP trust boundary -> `ctf-web` or `ctf-web-control-plane`.
- Model file/weights/serialization artifact -> `ctf-forensics` or `ctf-rev`.
- Adversarial or extraction objective -> remain here and measure against the challenge oracle.
- Unsafe deserialization or code execution -> preserve artifact and use the relevant Web/rev/forensics owner.

## Output Contract

```yaml
status: continue | pivot | escalate | blocked | dead | close
owner: ctf-misc | ctf-web | ctf-rev | ctf-forensics
facts: []
uncertainties: []
artifact_and_framework: {}
baseline: {}
attack_hypothesis: <one falsifiable statement>
metric_or_oracle: <how success is proven>
strongest_signal: <one sentence>
next_action: <one bounded input or inspection>
stop_reason: <required for blocked/dead/close>
```

## Stop Conditions

Stop when the metric/flag is met, the model is nondeterministic without a usable oracle, a payload would affect an external system, or the challenge boundary is actually application/runtime exploitation owned elsewhere.

## Workflow

1. Inventory model, wrapper, tokenizer, data, and runtime.
2. Establish a baseline and deterministic measurement.
3. Choose the smallest family: prompt/agent, adversarial input, extraction/inference, poisoning, serialization, or model logic.
4. Change one variable per attempt and record output/metric.
5. Verify the result independently and hand off if the decisive boundary changes.
