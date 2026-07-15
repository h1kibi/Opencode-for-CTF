# OpenCode Abstraction Boundaries

This configuration separates four kinds of extension points. Keep these boundaries stable when adding new CTF or daily functionality.

## Commands

Commands are user-facing workflow macros. They are best for explicit human entry points such as `/ctf`, `/ctf-hard-open`, `/ctf-final`, `/kb-refresh`, and `/safe-extract`.

Rules:

- Commands initialize or checkpoint a workflow.
- Commands may describe a standard sequence, but should not duplicate long domain doctrine.
- Commands should not be the primary mechanism for internal agent-to-agent control; prefer tools and skills for that.
- Keep command files short and action-oriented.

## Skills

Skills are lazy-loaded methodology. They should contain domain rules, reference dispatch, false-positive checks, and compact playbooks that only matter after matching evidence appears.

Examples:

- `ctf-web-java` for Java Web evidence.
- `ctf-whitebox-audit` for source, bytecode, config, or dependency evidence.
- `ctf-ledger-discipline` for hard branch control and resume state.
- `ctf-seckb` for local knowledge retrieval/update rules.

Rules:

- Put specialized doctrine in skills instead of primary agent prompts.
- Add clear trigger conditions at the top of each skill.
- Do not make every solve load every skill.
- Skills should guide tool choice and evidence gates, not become verbose writeups.

## Subagents

Subagents provide context isolation and specialized reasoning. Use them when the main context is noisy, when fanout is useful, or when a narrow expert review is needed.

Examples:

- `ctf-scout` for route/tool selection.
- `ctf-librarian` for evidence-keyed pattern recall.
- `ctf-oracle` for hypothesis sanity checks.
- `ctf-verifier` for final validation.
- Category subagents such as `ctf-web`, `ctf-pwn`, `ctf-rev`, `ctf-crypto`, `ctf-forensics`, and `ctf-misc` for scoped specialist work.

Rules:

- Subagents should not broadly exploit, fuzz, or mutate state without a scoped task.
- The primary agent owns final merge, top-3 hypothesis ranking, and closure decision.
- Fanout is for information gain; closure remains owned by the main agent unless explicitly handed off.
- Meta subagents should follow fixed IO contracts: scout = route/tool map, librarian = lesson/pattern recall, oracle = queue sanity, verifier = final/primitive validation.

## Tools

Tools are deterministic execution, structured analysis, and state management. They should reduce LLM formatting burden and compress multi-step recon where possible.

Tool categories:

- First-pass macro tools: `ctf-web-recon-pack`, `ctf-java-analyze-pack`, `ctf-source-first-pack`.
- Focused probes: `ctf-web-diff-probe`, `ctf-web-authz-matrix`, `ctf-rsa-probe`, `ctf-binary-probe`.
- State tools: `ctf-decision-state`, `ctf-solve-state`, `ctf-whitebox-handoff`.
- Retrieval tools: `seckb_*`, `cvekb_*`, pattern-card tools.

Rules:

- Prefer a macro tool for first-pass mapping; use focused tools after a signal appears.
- Prefer state tools over direct JSON editing.
- Tools should return compact ranked queues, first safe checks, blockers, and next recommended actions.

## Routing examples

### URL-only Web

1. `ctf-web-recon-pack mode=light`.
2. If JS/API/runtime signals appear, follow with focused JS/runtime/state tools.
3. Convert the strongest signal into one hypothesis and one probe.

### Java source or archive

1. Load `ctf-web-java` and `ctf-whitebox-audit` when evidence matches.
2. Run `ctf-java-analyze-pack mode=auto`.
3. Promote top chain candidates into decision state.

### Mixed source leak

1. Run `ctf-source-first-pack`.
2. Map route/input/auth/sink/closure signals.
3. Stop broad black-box probing until source-first gate is satisfied or explicitly blocked.

### Hard branching

1. Load `ctf-ledger-discipline`.
2. Use `ctf-decision-state` / `ctf-solve-state` for updates.
3. Keep top-3 active hypotheses and one next probe per branch.
