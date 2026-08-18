# Recon Map

- Route: POST /upload
- Signals: archive upload validation and confirmed server-side overwrite primitive

## Attack Queue

| Candidate | Value | Cost | Risk | Stability | Confidence | Decision |
|-----------|-------|------|------|-----------|------------|----------|
| upload validation matrix | 8 | 2 | 2 | 8 | 7 | selected |
| server-side file write closure | 9 | 3 | 4 | 7 | 6 | queued |

Upload validation/storage/archive checks route to ctf-web-upload.
Confirmed server-side write and overwrite checks route to ctf-web-file-write.
File write matrix created before target file selection. Attempt budget: 2.
Canary write completed before overwrite; no core file is touched before final-chain lock.
