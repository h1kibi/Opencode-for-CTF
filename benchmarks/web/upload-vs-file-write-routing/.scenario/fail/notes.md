# Recon Map

- Route: POST /upload
- Signals: archive upload validation and overwrite behavior

## Attack Queue

| Candidate | Value | Cost | Risk | Stability | Confidence | Decision |
|-----------|-------|------|------|-----------|------------|----------|
| upload bypass | 8 | 2 | 2 | 8 | 7 | selected |

The overwrite primitive was treated as a normal upload bypass and routed only to ctf-web-upload.
The agent selected the target file before a canary write and before a file-write matrix existed.
