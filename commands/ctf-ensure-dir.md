---
description: Recursively create a workspace directory when generic filesystem creation is too strict
agent: ctf-expert
subtask: true
---

Ensure a workspace directory exists with recursive parent creation.

Target/context:
$ARGUMENTS

Use this when a CTF workflow wants `work/ctf-evidence/<slug>/...` style directories and the generic filesystem helper fails on missing parents.
