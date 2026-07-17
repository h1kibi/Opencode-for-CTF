---
description: CTF domain: CTF-only CVE/N-day identification and hit-matching workflow
agent: ctf-master
subtask: false
---

# /ctf-cve - CTF-only CVE/N-day lookup

Input:
$ARGUMENTS

Use this command only inside `ctf-master` for authorized CTF/lab tasks. In daily mode, stop and tell the user to switch to `ctf-master` with the configured `agent_cycle` shortcut.

## Purpose

- Read-only CVEKB lookup during active solving.
- Product/version/fingerprint matching.
- CVE/GHSA hit collection.
- Related metadata comparison.
- Read-only local PoC reference/cache status lookup.
- Summary output for next-step manual reasoning.

Do not update CVEKB during active solving.

## Supported forms

```text
/ctf-cve CVE-2024-XXXX
/ctf-cve product Apache Struts 2.5.x
/ctf-cve signal log4j fastjson request uri
/ctf-cve compare CVE-2021-44228 CVE-2021-45046
/ctf-cve poc-ref CVE-2024-XXXX
/ctf-cve cache-status CVE-2024-XXXX
```

## Workflow

1. Extract challenge signals:
   - product name
   - version
   - banner
   - dependency file
   - Web path
   - error message
   - CVE/GHSA ID
2. Query local CVEKB read-only:

```powershell
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_lookup <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_match_product <product/version terms>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_related_hits <signal terms>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py cve_hit_summary <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py poc_reference_lookup <CVE>
{env:SECKB_PYTHON} {env:SECKB_ROOT}/cve/scripts/cvekb.py poc_cache_status <CVE>
```

3. Score hits by relevance only:
   - product match
   - version match
   - fingerprint/banner match
   - route/error/dependency match
   - source quality
4. Return compactly:
   - strongest candidate CVE/GHSA
   - matched evidence tokens
   - conflicting evidence
   - nearby related hits
   - what evidence is still missing

## Output discipline

- This command identifies and matches only.
- PoC reference/cache lookups are read-only and must not execute cached code.
- Do not generate exploit commands.
- Do not generate run contracts.
- Do not classify destructive execution risk.
- If evidence is weak, say `low-confidence hit` instead of stretching the match.
