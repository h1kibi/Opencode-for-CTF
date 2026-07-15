# Java SpEL / Thymeleaf FileCopyUtils Chain

Derived from ljagiello/ctf-skills `ctf-web/server-side-exec.md` Thymeleaf SpEL note.

Use when Spring Boot/Thymeleaf/SpEL expression rendering is reachable and standard RCE/file I/O names are filtered or the container lacks a shell.

## Trigger Signals

- Thymeleaf template preview, fragment render, view expression, or user-controlled template body.
- SpEL syntax `${...}`, `#{...}`, or `T(...)` appears in errors/source.
- WAF blocks `Runtime`, `ProcessBuilder`, `FileInputStream`, `exec`, or `flag`.
- Distroless/no-shell container where `Runtime.exec()` is useless.
- Admin-only preview endpoint combined with mass assignment or role/session confusion.

## First Safe Checks

1. Confirm engine/context with harmless expression marker, not generic SSTI payloads.
2. Check whether expression can access `T(java.lang.String)` or other type references.
3. If admin-only, check mass assignment/session role first before payload depth.
4. Prefer file-read primitives over command execution in distroless containers.

## File Read Gadgets

Use only after confirming expression evaluation and challenge authorization.

```text
${new java.lang.String(T(org.springframework.util.FileCopyUtils).copyToByteArray(new java.io.File("/flag.txt")))}
${T(org.springframework.util.StreamUtils).copyToString(new java.io.FileInputStream("/flag.txt"), T(java.nio.charset.StandardCharsets).UTF_8)}
${new String(T(java.nio.file.Files).readAllBytes(T(java.nio.file.Paths).get("/flag.txt")))}
```

## WAF Bypass Ideas

- Use Spring utility classes when direct Java I/O names are blocked.
- Split sensitive strings: `"fl"+"ag.txt"`.
- Prefer directory listing first to discover exact path.
- Avoid shell assumptions; read files directly.

## Stop Rules

- Do not keep trying RCE if file-read gives a flag path.
- After two expression probes without evaluation/error differential, pivot to engine/context source mapping.
- If type access is blocked, look for model/env/config leak or view path traversal instead.
