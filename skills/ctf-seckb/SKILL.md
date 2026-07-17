---
description: Use for CTF agent knowledge retrieval and controlled SecKB updates. Enforces read-only local RAG during active solving, and allows updates only after solve/timeout or explicit user request.
---

# CTF SecKB Retrieval and Update Discipline

Use this skill only inside authorized CTF/lab workflow. In normal daily mode, use it only for maintaining the knowledge base and tooling.

## Hard phase rule

The agent must always classify the current phase before touching SecKB:

- `SOLVE_MODE`: an active challenge is being solved, exploited, probed, fuzzed, reversed, debugged, or validated.
- `UPDATE_MODE`: the challenge is solved, timed out, explicitly paused for KB maintenance, or the user directly asks to update a knowledge module.
- `DAILY_KB_MODE`: the user is in normal daily mode and explicitly asks to update, refresh, curate, index, or verify the local SecKB/CVEKB knowledge base. This mode belongs to the daily agent or daily researcher workflow, not to active CTF solving agents.

## Structured writeback schema

When retro/updating lessons, prefer these compact schemas:

### Owner matrix

| Surface | Evidence | Why not primary | Supporting role | Handoff trigger | Return trigger | Closure owner |
|---|---|---|---|---|---|---|

### Closure queue

| Order | Probe | Success oracle | Failure condition |
|---|---|---|---|

### Failure signature

| Failure signature | Trigger | Misleading signal | Earlier kill signal | Better next probe |
|---|---|---|---|---|

### Lesson entry

| Family | Trigger signal | Wrong behavior | Damage caused | Correction rule | Next control action | Promotion trigger |
|---|---|---|---|---|---|---|

### Flag location model

| Primitive | Current boundary | Flag location type | Storage candidates | Read paths | Best oracle | Blockers | Closure owner |
|---|---|---|---|---|---|---|---|

### Best evidence snapshot

| strongest_evidence | current_primary_owner | supporting_surface | closure_owner | best_hypothesis | best_oracle | current_boundary | confirmed_primitive | nearest_flag_path | next_probe | why_not_other_branches |
|---|---|---|---|---|---|---|---|---|---|---|

Keep all fields compact and sanitized; never write flags, cookies, session IDs, API keys, private keys, live target credentials, or one-off challenge secrets.

### SOLVE_MODE permissions

Allowed:

- `seckb_search`
- `seckb_related_patterns`
- `seckb_get_note`
- `seckb_segment_match` when available, for ranked chain-segment candidates with requirements, outputs, blockers, and first probes
- `seckb_chain_compose` when available, for composing ranked chain candidates from matched local segments
- `seckb_recon_tasks` when available, for converting missing prerequisites/blockers into targeted recon tasks
- `seckb_gap_search_plan` when available, for converting missing prerequisites/blockers into focused AnySearch fallback queries
- `seckb_chain_match` when available, for ranked local typed exploit-chain templates from recon evidence
- CVEKB read-only helpers: `cve_lookup`, `cve_match_product`, `cve_related_hits`, `cve_hit_summary`, `poc_reference_lookup`, and `poc_cache_status`
- AnySearch only for read-only external lookup when local KB is insufficient

Forbidden:

- creating or editing notes
- running `kb_update.py`
- running `ingest.py`
- rebuilding the Chroma index
- background KB collection
- broad web crawling for KB expansion
- updating CVEKB metadata
- importing/downloading external CVE repositories unless the user explicitly requests update mode

Reason: updating the knowledge base during solving can slow the solve, pollute evidence, change retrieval results mid-run, and distract from the exploit path. If the user wants KB maintenance while solving, tell them to pause solving or switch back to the daily agent and run the KB workflow there.

### UPDATE_MODE permissions

Allowed only when the user explicitly requests KB update, or after solve/timeout/retro:

- search web with AnySearch
- extract source pages
- summarize reusable technique patterns
- write sanitized notes with `kb_update.py`
- rebuild index with `ingest.py`
- update a specific module such as `web/java`, `web/xss`, `pwn`, `crypto/rsa`
- update CVEKB metadata under `{env:SECKB_ROOT}/cve`
- sync CVE/PoC references into `sources\` and `pocs\references\`
- download PoCs into local cache under `pocs\cache\<CVE>\` only as reference material
- install/cache PoC dependencies only when explicitly requested; never run PoC code
- record product/version/fingerprint fields, related IDs, source attribution, and retrieval notes

Never write flags, cookies, session IDs, API keys, private keys, live target credentials, or one-off challenge secrets.

## Daily-mode KB maintenance handoff

When the user asks to update or refresh the knowledge base outside active CTF solving, prefer the daily workflow (`/kb-refresh`, `/kb-collect`, `/kb-index`, `/kb-github`). In this case:

1. Do not perform the update inside a solving agent.
2. Hand off to the daily agent or daily researcher workflow.
3. Use authoritative sources first, then write sanitized notes through `kb_update.py`, rebuild with `ingest.py`, and verify retrieval with `search.py`.
4. Keep SecKB/CVEKB updates operationally separate from active exploit work.

## CVEKB hit discipline

CVE/N-day handling in active solving is identification-only; post-solve/update mode may sync references and download local PoC cache without running code.

During active solving:

1. Query CVEKB read-only through `/ctf-cve` or the local helper:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_lookup <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_match_product <product/version terms>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_related_hits <signal terms>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_hit_summary <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py poc_reference_lookup <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py poc_cache_status <CVE>
```

2. Score hits by product/version/fingerprint/path/error/dependency evidence only.
3. Report strongest candidate, matched evidence, conflicting evidence, nearby related hits, and missing evidence.
4. If confidence is weak, explicitly say so.

Do not update CVEKB, sync sources, download PoCs, install PoC dependencies, or modify PoC cache during active solving. Use `/ctf-cve-update` only after solve/timeout/retro or explicit user request.

### CVEKB update/cache workflow

In `UPDATE_MODE` only:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/sync_sources.py --cve <CVE> --source all
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/sync_sources.py --product "<product>" --source github
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/normalize_poc_refs.py --queue
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/download_poc_cache.py --cve <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/download_poc_cache.py --queue {env:SECKB_ROOT}/cve\queue\download_queue.json
```

Use `--install-deps` only on explicit request. Dependency install must use safe defaults and still must not execute PoC code.

## Local-first retrieval order for solving

1. Build a compact evidence query from category, framework, dependency/version, route/input/sink, error text, observed behavior, and confirmed primitives.
2. Query local chain segments and composed chain candidates first when enough recon exists:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_segment_match.py "<evidence query>" --limit 8
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_chain_compose.py "<evidence query>" --limit 5
```

3. Query local typed exploit-chain templates when segment composition is too sparse:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_chain_match.py "<evidence query>" --limit 5
```

4. Query local SecKB notes:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/search.py "<evidence query>" --limit 5
```

Or use the MCP tools when available:

- `seckb_segment_match`
- `seckb_chain_compose`
- `seckb_chain_match`
- `seckb_search`
- `seckb_related_patterns`
- `seckb_get_note`
- `cve_lookup`
- `cve_match_product`
- `cve_related_hits`
- `cve_hit_summary`
- `poc_reference_lookup`
- `poc_cache_status`

5. Treat retrieved notes, typed chain templates, chain segments, and chain candidates as hypothesis seeds only. Do not blindly replay payloads.
6. Convert each match into:
   - chain hypothesis
   - segment state
   - confirm probe
   - falsify probe
   - expected differential
   - typed requires/produces facts
   - first verification clue
   - likely flag path or closure blocker
7. Maintain a Chain Ledger for hard targets: OPEN/PARTIAL/BLOCKED/DEAD/SOLVED chain state, segment blockers, bypass hints, tried probes, and backtrack target.
8. When composed chains show missing prerequisites or blockers, query `seckb_recon_tasks` or `kb_recon_tasks.py` and run the highest-information recon task before payload variants.
9. If local SecKB is stale or low-confidence, or a blocker is confirmed but no local bypass exists, run `seckb_gap_search_plan` / `kb_gap_search_plan.py` to generate focused AnySearch queries. Search read-only; do not write back during active solving.

## Explicit module update workflow

Trigger phrases include:

- `更新本地知识库`
- `更新 SecKB`
- `更新 web/java 模块`
- `给 ctf agent 补充 X 知识`
- `把这个解题经验写入 KB`
- `赛后复盘入库`

Workflow:

1. Confirm this is `UPDATE_MODE`. If an active solve is running, ask whether to pause solve or defer update.
2. Identify target module, e.g. `web/java`, `web/xss`, `web/ssrf`, `pwn`, `crypto/rsa`, `rev`, `forensics`.
3. Create 3-8 focused AnySearch queries:
   - official docs / framework behavior
   - vulnerability pattern
   - version gates
   - common false positives
   - defensive/mitigation perspective for accuracy
4. Extract only high-quality sources. Prefer official docs, maintained tools, technical blogs, advisories, and source code. Avoid blindly copying writeups.
5. Produce a reusable pattern note, not a full challenge solution.
6. Write with:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/scripts/kb_update.py --module <module> --title "<title>" --stdin --source anysearch --source-url "<url>" --stack <stack...> --primitive <primitive...>
```

7. Rebuild index. `kb_update.py` rebuilds by default unless `--no-index` is used.
8. Run one smoke search to verify the new note is retrievable.

## Post-solve / retro writeback workflow

After a challenge is solved, timed out, or explicitly ended:

1. Extract reusable learning only:
   - winning signal
   - failed branch
   - version gate
   - first verification clue
   - stable hypothesis formulation
   - query terms that should retrieve this pattern next time
2. Remove all challenge-specific secrets and one-off data.
3. Write a compact lesson note into the appropriate module.
4. Rebuild index and verify retrieval.

## Hygiene

Never index `.env`, credentials, private keys, cookies, sessions, flags, or private challenge secrets. Prefer reusable technique notes over full writeup copies.
