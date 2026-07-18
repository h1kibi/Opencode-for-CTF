---
description: Build pwnlab Docker images for binary exploitation challenges.
agent: ctf-pwn
subtask: false
---

# Build pwnlab Docker Images

Build the pwnlab Docker images for binary exploitation:

```
cd <repo-root>/docker
docker compose -f docker-compose.pwnlab.yml build
```

This builds all pwnlab variants:

- `pwnlab:general-ubuntu22.04` (default)
- `pwnlab:general-ubuntu20.04`
- `pwnlab:general-ubuntu18.04`
- `pwnlab:general-ubuntu24.04`
- `pwnlab:i386-ubuntu20.04`
- `pwnlab:general-debian11`
- `pwnlab:general-debian12`
- `pwnlab:aarch64`
- `pwnlab:mipsel`
- `pwnlab:heavy-ubuntu22.04`

Run `ctf-env-check category=pwn` to verify the images are built.
