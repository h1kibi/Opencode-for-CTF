---
description: CTF environment readiness check — verify Docker, pwnlab/revlab images, Android Studio/ADB, and CLI tools for pwn/rev.
agent: ctf-fast
subtask: false
---

# CTF Environment Check

Run `ctf-env-check category=<pwn|rev|all>` to check whether the required runtime environments are prepared.

## Scope

$ARGUMENTS

## Rules

- If `category=pwn`: check Docker daemon, pwnlab Docker images, and pwn CLI tools (pwntools, gdb, checksec, ROPgadget, etc.).
- If `category=rev`: check Docker daemon, revlab Docker image, Android Studio/SDK, ADB device, and rev CLI tools.
- If `category=all` (default): check everything.

## Build preparation (if images are missing)

If pwnlab images are missing:

```
cd docker
docker compose -f docker-compose.pwnlab.yml build
```

If revlab image is missing:

```
cd docker
docker compose -f docker-compose.revlab.yml build
```

## Workflow

1. Choose the category that matches the current challenge type.
2. Read the check results carefully.
3. If critical tools are missing, report them to the user with the suggested install command.
4. If Docker images are missing, suggest building them.
5. If Android/ADB is missing for an APK challenge, suggest setting up Android Studio.
