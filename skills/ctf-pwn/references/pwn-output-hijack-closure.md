# PWN Output Hijack Closure

Use this reference when a confirmed write, adjacency corruption, or long-lived state mutation can likely reach an existing output path faster than shell/ROP closure.

Priority targets:

1. adjacent strings used by `puts` / `printf` / `write` / `send`
2. format strings, length fields, and output buffer metadata
3. file paths, state bytes, branch flags, or selector values that redirect existing output
4. parser buffers or globals consumed later by a logging or status function

Shortest-path questions:

- Can an existing success/error/status path be repointed to the flag path?
- Can a later output consumer be widened or redirected with one stable write?
- Is this faster than shell, ROP, or arbitrary file-write exploration?

Downgrade rule:

- If two output-hijack probes fail to change a real consumer or observable output boundary, demote this closure owner and rerank one orthogonal route.
