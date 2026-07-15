# Source-leak audit bridge

Use when black-box recon finds source maps, `.git`, backup archives, exposed Docker/config files, stack traces, leaked JAR/class files, PHP source, Composer/Maven/Gradle manifests, Swagger/OpenAPI, or debug panels.

## Bridge flow

```text
leak found
  -> safe extraction / bounded read
  -> identify language and framework
  -> route map
  -> auth/session/filter/interceptor map
  -> sink map
  -> evidence contract
  -> ctf-decision-state rank
```

## Evidence contract

Every promoted source-guided hypothesis should carry:

```json
{
  "route": "method + path",
  "input_control": "full|conditional|none|unknown",
  "sink_family": "sql|file-read|file-write|upload|ssrf|xss|ssti|deser|authz|logic|command",
  "evidence_ids": ["REQ_001", "RESP_002", "SRC_003", "DIFF_004"],
  "confirmed": false,
  "missing_evidence": ["reachable route", "auth boundary", "sink not confirmed"]
}
```

## PHP bridge

For PHP leaks, require route/parameter mapping before sink claims. Track handler, controllable parameters, include/file/upload/deser/template/session behavior, and whether evidence closes. If the trace is partial, keep the branch as pending, not confirmed.

## Java bridge

For Java/Spring/Servlet/JAX-RS/Struts/JAR leaks, extract routes and parameters first, then filters/interceptors/auth annotations, then sinks. JAR/class leaks should trigger decompile-assisted route mapping when available. Pay special attention to Spring Boot actuator, Shiro, Spring Security, JWT filters, MyBatis dynamic SQL, Servlet path normalization, and Struts/JAX-RS annotations.
