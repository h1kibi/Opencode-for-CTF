# Java Web Practice Playbook

Use as the final execution checklist for Java Web CTF challenges.

## Source / Artifact Route

1. Live URL only:
   - Web fingerprint/blackbox first.
   - Look for Java indicators: `JSESSIONID`, Tomcat, Spring error, actuator, JSP, `.do`, `.action`.
   - If source/artifact appears, switch to artifact route.

2. Source tree:
   - `ctf-java-config-map` on root.
   - `ctf-java-map` on source root.
   - `ctf-java-dep-risk` on root/build files.

3. JAR/WAR:
   - `ctf-java-archive-map` first.
   - `ctf-safe-extract`.
   - `ctf-java-config-map` on extracted root.
   - `ctf-java-map` on source/classes when text source exists.
   - `ctf-java-bytecode-hints` for bytecode-only app classes.
   - `ctf-java-dep-risk` on extracted root/libs.

## Attack Queue Order

1. Direct config/debug/control plane:
   - actuator, H2, Swagger, stack trace, config leak, default creds.
2. Source-proven simple sinks:
   - MyBatis `${}`, file read/write, upload path, template expression, XXE/SSRF.
3. Auth/filter route confusion:
   - Spring Security/Shiro/filter/interceptor/session role mismatch.
4. Dependency-driven bugs:
   - only after version + config gate + reachable sink + controlled data shape.
5. Long gadget chains or broad fuzzing:
   - only after shorter source/config routes fail.

## Final Gate

Before final exploit/report, ensure:

- Route and method are exact.
- Auth/session state is reproducible.
- Controlled input reaches the sink.
- Config/dependency gate is proven.
- The primitive reaches flag/admin/config/source, not just an error.
- Final request/script is minimal and repeatable.
