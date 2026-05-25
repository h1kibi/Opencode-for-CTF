# Parser and Proxy Web CTF Patterns

## Pattern: URL parser discrepancy SSRF

Signals:
- User-controlled URL.
- Allowlist or blacklist.
- Different behavior for encoded host, username part, slash normalization, redirect, or IP literal.

Expected primitive:
- SSRF allowlist bypass.

First safe check:
- One challenge-local benign URL parser differential probe.

Attack queue effect:
- Value: 4
- Cost: 2
- Risk: 2
- Stability: 3

Stop rule:
- Stop after two parser variants without response differential.

## Pattern: Reverse proxy Host/X-Forwarded trust

Signals:
- Host-dependent routing.
- `X-Forwarded-Host`, `X-Forwarded-Proto`, cache/proxy headers.
- Admin/internal URL generation.

Expected primitive:
- Admin link poisoning, cache poisoning, redirect, or internal trust bypass.

First safe check:
- One header-diff request and compare reflected links/headers only.

Risk:
- Cache poisoning can affect shared state; require High-Risk Action Plan before poisoning attempts.
