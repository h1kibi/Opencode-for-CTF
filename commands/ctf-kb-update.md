---
description: CTF post: Controlled SecKB update workflow for ctf-expert. Use only after solve/timeout or explicit user request; never during active solving.
---

# /ctf-kb-update - Controlled local SecKB update

This command updates the local CTF knowledge base at `{env:SECKB_ROOT}`.

## Phase gate

Before any update, classify phase:

- If active solving is ongoing: do not update. Ask the user whether to pause/defer the update.
- If the user explicitly requested this command or the challenge is solved/timed out: proceed in `UPDATE_MODE`.

## Inputs

Expected user forms:

```text
/ctf-kb-update web/java log4j request uri logging chain
/ctf-kb-update web/xss CSP multi inline script admin bot
/ctf-kb-update pwn format string libc leak pattern
/ctf-kb-update after-solve 把刚才复盘写入 KB
```

The first token should be the target module when possible:

```text
web/java
web/xss
web/ssrf
web/upload
web/sqli
pwn
crypto/rsa
rev
forensics
misc
```

## Workflow

1. Confirm `UPDATE_MODE`.
2. Identify module and topic.
3. Search local SecKB first to avoid duplicate notes:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/search.py "<topic>" --limit 5
```

4. If update requires web research, use AnySearch:
   - 3-8 focused queries
   - prefer official docs, advisories, source code, maintained tools, and high-quality technical analysis
   - avoid copying full writeups
5. Draft a reusable pattern note with sections:
   - 触发信号
   - 第一安全检查
   - 关键版本/门槛
   - 决策价值
   - 常见误区
   - Pattern Query
6. Sanitize:
   - no flags
   - no cookies
   - no session IDs
   - no API keys
   - no private keys
   - no live target credentials
7. Write note through the safe helper:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_update.py --module <module> --title "<title>" --stdin --source anysearch --stack <stack...> --primitive <primitive...>
```

8. Verify retrieval. If module is `web/java`, use `--category web --subcategory java`; if module is `pwn`, use `--category pwn`:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/search.py "<pattern query>" --category <category> --limit 5
```

## Strict prohibitions

- Do not run this during active exploitation/probing/fuzzing/debugging.
- Do not rebuild index during active solving.
- Do not index raw challenge attachments wholesale.
- Do not store secrets, flags, cookies, tokens, or credentials.
- Do not overwrite an existing note unless the user explicitly asks.

## Output report

Report:

- module updated
- note path
- sources used
- index rebuild result
- smoke-search query and result
- any skipped/duplicate notes
