---
name: ctf-web-cloud
description: Use when Web CTF evidence mentions Docker, Kubernetes, k8s, metadata service, .env, health/metrics/debug, CI artifacts, object storage, S3/MinIO/OSS, subdomain takeover, webhook secrets, or deployment exposure.
---

# CTF Web Cloud/Container/Deployment

Model deployment surfaces as high-yield source/secret pivots.

First safe checks:

- Classify environment from headers, errors, JS config, hostnames, file paths, and service banners.
- Check low-cost debug/config/health/metrics surfaces and exposed `.env`/git history/CI artifacts.
- If SSRF exists, model metadata/Docker/Kubernetes paths before broad internal port scanning.
- For object storage/CDN/subdomain signals, classify takeover or bucket exposure fingerprint before attempting writes.
- For webhooks/OAuth apps/support widgets, map trust boundary and secret handling with harmless echo/signature checks.

Pattern recall queries:

- `Docker socket Kubernetes metadata env metrics CI artifact SSRF`
- `S3 MinIO bucket subdomain takeover object storage CTF`
- `webhook secret support widget analytics token CI/CD`

References in local mirror:

- `ctf-web/server-side-advanced-2.md`
- `ctf-web/auth-infra.md`
- `ctf-web/auth-and-access.md`
- `ctf-web/field-notes.md`
