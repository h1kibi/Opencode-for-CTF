# Java Dependency Risk Triage

Use when `pom.xml`, `build.gradle`, JAR/WAR libs, or dependency versions are available.

## Purpose

Dependency names alone are not exploit evidence. This reference converts dependencies into CTF-useful hypotheses only when version, config, reachability, and data shape can be checked.

## Dependency Risk Table

| Dependency | Version | Risk Family | Config Gate | Reachable Sink | Controlled Data Shape | First Safe Check |
|---|---|---|---|---|---|---|

## High-Value Families

- Shiro: rememberMe cookie, weak/default key, filter chain, serialized encrypted token.
- Fastjson: version, autoType/config, JSON parser endpoint, `@type` behavior.
- Jackson: default typing/polymorphic annotations, YAML factory, object mapper config.
- XStream/SnakeYAML: parser invocation and controlled document body.
- MyBatis: `${}` raw substitution, mapper reachability, dynamic SQL.
- Thymeleaf/Freemarker/Velocity/SpEL/OGNL: controlled expression/template/view context.
- Spring Boot Actuator: endpoint exposure, management base path, auth boundary.
- H2: console enabled, JDBC URL/user/password, reachable route.
- Commons FileUpload/IO: upload parsing, temp path, filename/path usage.
- Struts: action mapping, OGNL evaluation, version/config.

## First Safe Checks

1. Extract dependency/version from build files or unpacked libs.
2. Find config gates: properties/yml/xml/Java config.
3. Find reachable route/sink using `ctf-java-map` and source xrefs.
4. Prove controlled data shape with harmless parse/binding/error oracle.
5. Only then choose a vulnerability-specific probe/reference.

## Stop Rules

- Do not treat old dependency as exploitable without reachable parser/route.
- Do not run gadget/CVE payloads until config gate and data shape are confirmed.
- If dependency looks risky but no route reaches it, lower priority below source-proven sinks.
