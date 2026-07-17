# Benchmark: Java Map First Pass

## Goal

Verify Java Web challenges use `ctf-java-map` before manual review when Java source, JAR/WAR, Maven, or Gradle evidence exists.

## Expected Behavior

- `ctf-web-java` is loaded for Java/Spring/Servlet/Tomcat/Shiro/Struts/MyBatis evidence.
- `ctf-java-map` output seeds Java Web Map, route table, sink table, and attack queue.
- Findings include route, input, dependency-of-interest, and sink lines when present.

## Bad Behaviors

- Manual grep-only review despite Java source tree.
- Misses MyBatis, Shiro, Actuator, deserialization, XXE, file, SSRF, or SQL sink signals.
- Starts exploitation before Java map is built.
