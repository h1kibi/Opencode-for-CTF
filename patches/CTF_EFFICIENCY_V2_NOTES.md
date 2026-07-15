# CTF Agent Efficiency Patch Notes

> Historical note: this patch originally referred to the primary CTF agent as `ctf-agent`; the current name is `ctf-rigorous`.

This patch note is based on the uploaded `opencode_scheme1_efficiency_patched(1).zip`.

## Priority 0: keep the user-facing design

Keep exactly two primary agents:

- `daily`: default non-CTF development agent.
- `ctf-agent`: primary CTF router/solver.

Keep category-specific agents as hidden subagents, but avoid invoking them for trivial or single-file tasks.

## Priority 1: reduce CTF primary skill exposure

Replace `ctf-agent.permission.skill`:

```jsonc
"skill": {
  "*": "deny",
  "ctf-common": "allow",
  "ctf-router": "allow",
  "ctf-terminal": "allow",
  "ctf-web": "allow",
  "ctf-pwn": "allow",
  "ctf-rev": "allow",
  "ctf-crypto": "allow",
  "ctf-forensics": "allow",
  "ctf-misc": "allow"
}
```

Rationale: the primary router currently sees every granular web skill. That is accurate but increases tool-selection overhead. Let the hidden web subagent see granular web skills; let the primary CTF agent see only router/common/category skills.

## Priority 2: add high-frequency read-only bash allows

Add these after `"*": "ask"` and before destructive deny rules in all CTF agents where relevant:

```jsonc
"cat *": "allow",
"sed *": "allow",
"awk *": "allow",
"jq *": "allow",
"base64 *": "allow",
"tr *": "allow",
"sort *": "allow",
"uniq *": "allow",
"cut *": "allow",
"od *": "allow",
"hexdump *": "allow",
"mkdir -p work*": "allow",
"mkdir -p extracted*": "allow",
"cp * work/*": "allow",
"cp * extracted/*": "allow",
"tar -xf * -C extracted*": "allow",
"unzip -q * -d extracted*": "allow",
"7z x * -oextracted*": "allow"
```

Add category-specific allows:

```jsonc
// pwn/rev
"readelf *": "allow",
"objdump *": "allow",
"nm *": "allow",
"checksec *": "allow",
"gdb -q *": "allow",

// crypto
"openssl *": "allow",
"sage *": "allow",
"sage -python *": "allow",

// forensics
"exiftool *": "allow",
"binwalk *": "allow",
"tshark *": "allow",
"zsteg *": "allow",
"steghide *": "ask"
```

Do not allow broad wrappers such as `timeout *`, `bash -c *`, or `sh -c *`, because they can accidentally bypass command-specific deny rules.

## Priority 3: change the primary CTF prompt

Replace the `ctf-agent.prompt` with this efficiency-first version:

```text
You are ctf-agent, an efficiency-first primary solver/router for authorized CTF, lab, benchmark, and local challenge targets.

Goal order: fastest verified flag > reproducible solve > complete notes. Never guess flags.

Fast path policy:
1. In the first pass, spend at most 5 cheap actions: read statement, inventory files/services, run ctf-file-triage when artifacts exist, run ctf-rsa-probe for RSA-like text, run ctf-web-probe only for authorized/local URLs.
2. If a direct path exists (decode, grep, archive, RSA weak case, source leak, config secret, single-file script, obvious transform), solve directly in the primary agent. Do not spawn a subagent.
3. Spawn exactly one specialized ctf-* subagent only when category workflow is clearly faster than direct solving or the task needs more than three non-trivial branch decisions.
4. Batch read-only triage into one tool/command where possible. Prefer scripts over many one-off commands.
5. Keep notes.md optional for trivial tasks. For branching tasks, keep notes.md compact: durable facts, current hypothesis, failed branches, primitive confirmations, final chain.
6. Use category skills only when evidence matches. Do not load unrelated granular skills.
7. If stuck after two failed branches, write a short stuck summary, switch category once if evidence supports it, then continue. Before declaring unsolved, run ctf-flag-grep on relevant output/work/extracted directories.
8. Write only verified final flags to agent_flag.txt.
```

## Priority 4: make Web faster by adding a fast lane

Prepend this to `ctf-web.prompt` and `commands/ctf-web.md`:

```text
Web fast lane before full state machine:
- If source is present, first inspect route definitions, dependency manifests, templates, config, Docker/env defaults, and obvious sinks in <= 3 tool calls. Prefer ctf-java-map or ctf-api-map when applicable.
- If only a live URL is present, run ctf-web-probe once, fetch same-origin JavaScript discovered by the probe when small, and grep for routes, tokens, source maps, debug flags, and flag-like strings.
- Enter the full recon -> attack-queue -> focused-probe state machine only for multi-surface, stateful, bot, upload, file-write, race, or unclear challenges.
- If a verified low-risk primitive directly leads to the flag, skip attack-queue bureaucracy and build the final solve script.
```

## Priority 5: reduce step budgets

Suggested values:

```jsonc
"ctf-agent": { "steps": 45 },
"ctf-web": { "steps": 60 },
"ctf-crypto": { "steps": 60 },
"ctf-forensics": { "steps": 60 },
"ctf-misc": { "steps": 60 },
"ctf-pwn": { "steps": 80 },
"ctf-rev": { "steps": 80 }
```

## Priority 6: custom tools to add next

Highest ROI tools:

1. `ctf-quick-triage`: one call combines file inventory, magic bytes, entropy, strings, flag grep, archive listing, RSA hinting, category scoring, and next three actions.
2. `ctf-safe-extract`: safely extracts zip/tar/7z into `extracted/` with Zip Slip/path traversal protection and records extracted tree.
3. Extend `ctf-web-probe`: optionally fetch same-origin JS and sourcemaps with strict caps; grep endpoints, tokens, and flag-like strings.
4. Extend `ctf-rsa-probe`: optionally attempt small-message, shared-prime, common-modulus, Fermat-near-prime, Wiener, and simple no-padding attacks, then emit a reproducible solve script when successful.

