# Parser differential playbook

Use for black-box endpoints with parser, proxy, URL, cache, or format ambiguity. Prefer `ctf-web-diff-probe` over payload storms.

## Differential families

| Family | One-variable mutant | Interesting delta |
|---|---|---|
| Method | GET vs OPTIONS/HEAD, or explicit safe alternate | Status/header/route behavior changes |
| Content-Type | form vs JSON vs text vs XML | Backend parser switch or mass assignment |
| Duplicate param | `a=base&a=marker` | first-wins/last-wins/frontend-backend mismatch |
| Param location | query vs body vs cookie vs header | Hidden trust boundary |
| Path normalization | `/./x`, `//x`, `;x=1`, encoded slash | Proxy/app route mismatch |
| Encoding | single vs double encoded | Filter/parser discrepancy |
| Header trust | Host/X-Forwarded-Host/X-Original-URL | SSRF, cache poisoning, route override |
| Cache key | query/header/body mismatch | Stored response or poisoning primitive |
| Auth state | no cookie/user A/user B/stale | IDOR/session/CSRF clues |

## Rules

- Baseline first, mutant second, same cookie and headers unless testing auth/header.
- Record status, redirect, content-type, length, hash, snippet, and Set-Cookie deltas.
- A differential is not a vulnerability until linked to a primitive or flag path.
- If three same-family mutants produce no new differential, stop that family and rerank.
