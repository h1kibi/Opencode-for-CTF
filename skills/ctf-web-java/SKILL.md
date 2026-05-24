---
name: ctf-web-java
description: Use for authorized Java Web CTF challenges involving Spring Boot, Servlet/JSP, Tomcat, Shiro, Struts, MyBatis, Thymeleaf, Freemarker, Velocity, SpEL, OGNL, EL injection, Java deserialization, XXE, SSRF, file traversal, upload parsing, or dependency-driven behavior.
compatibility: opencode
---

# CTF Web Java

## Purpose

Use when Web challenge evidence includes `.java`, `.jsp`, `.jar`, `.war`, `pom.xml`, `build.gradle`, Spring, Servlet, Tomcat, Shiro, Struts, MyBatis, Java stack traces, or Java-specific cookies such as `JSESSIONID`.

## First Pass

When Java source, `.jar`, `.war`, `pom.xml`, or `build.gradle` is available, run `ctf-java-map` before manual review. Use its output to seed the Java Web Map, route table, sink table, and attack queue.

1. Identify packaging:
   - source tree
   - jar
   - war
   - Docker image
   - Maven / Gradle

2. Identify framework:
   - Spring Boot
   - Servlet/JSP
   - Struts
   - Shiro
   - JAX-RS
   - raw Tomcat

3. Map routes:
   - Spring annotations: `@RequestMapping`, `@GetMapping`, `@PostMapping`
   - Servlet: `web.xml`, `@WebServlet`
   - JSP pages and included files

4. Map security:
   - filters
   - interceptors
   - Spring Security
   - Shiro config
   - session/cookie logic

5. Map sinks:
   - SQL
   - file read/write
   - template render
   - expression evaluation
   - XML parse
   - deserialization
   - outbound HTTP
   - command execution

## Java Decision Tree

- MyBatis `${...}`, raw `Statement`, string-built native SQL -> SQLi candidate.
- `RestTemplate`, `HttpClient`, `URL.openConnection` -> SSRF candidate.
- `File`, `Paths.get`, `Resource`, download/view/template path -> LFI/path traversal candidate.
- Thymeleaf/Freemarker/Velocity/JSP EL/SpEL/OGNL user-controlled expression -> SSTI/expression injection.
- `ObjectInputStream`, `readObject`, Fastjson, Jackson default typing, XStream, SnakeYAML -> deserialization candidate.
- XML parser factories without secure features -> XXE candidate.
- Shiro rememberMe or weak key -> token/session candidate.
- Actuator exposed endpoints -> debug/config/control-plane candidate.

## Output Contract

```markdown
# Java Web Map

## Framework
- Build:
- Runtime:
- Framework:
- Security:

## Routes

| Route | Method | Handler | Inputs | Auth | Sink |
|---|---|---|---|---|---|

## Java Sinks

| File | Method | Sink | Input Source | Candidate Primitive |
|---|---|---|---|---|

## Dependencies of Interest

| Dependency | Version | Why Relevant |
|---|---|---|
```
