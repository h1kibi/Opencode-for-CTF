# Web Closure Matrix

Use this reference after a concrete Web primitive is confirmed. The goal is to shorten primitive-to-flag convergence and prevent reopening broad discovery.

| Primitive | Highest-value closure path | First safe probe | Downgrade trigger |
|---|---|---|---|
| source leak | backward-slice to admin route, sink, secret, or direct flag path | identify one reachable route or secret-bearing config key from source | two probes do not move closer to secret, sink, or privileged route |
| file read / LFI | flag/config/env/source ladder | test the most likely challenge-local path class first | two stable denied classes with no new differential |
| DB read / SQLi | flag/admin/config tables | enumerate the smallest likely table or row family | table guesses stay generic and no value path appears |
| SSRF / internal fetch | internal admin/debug/config/source | fetch one likely privileged internal endpoint or metadata path | response model is still blind after callback or direct-read canary |
| upload / file write | served path, include/render trigger, template/import adapter | verify one readback or include/render trigger with a harmless canary | storage is confirmed but no consumer/serve path exists after two probes |
| admin/session control | privileged routes, export/debug/log/API | open one privileged surface with highest evidence of secret/flag value | new privileged pages are only cosmetic and no data path appears |
| browser/admin-bot XSS | cookie/storage/DOM/admin-only same-origin path | run one harmless visit/storage/origin canary before payload variants | no privileged browser state or same-origin secret path is visible |
| RCE / command exec | direct file read, env/config, readflag path | test one low-noise file-read or config-read command | shell aesthetics dominate and no secret path is attempted |

Rules:

- Prefer the shortest path that can read, export, or directly display the secret.
- If a higher-order sink becomes visible, reclassify the current primitive as `source_primitive` and hand closure to the stronger sink.
- Do not keep medium-value branches alive once a shorter closure path exists.
