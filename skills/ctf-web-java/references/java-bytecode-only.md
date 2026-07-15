# Java Bytecode-Only Web

Use when a Java Web challenge provides only compiled `.class`, `.jar`, or `.war` artifacts and source is missing or incomplete.

## First Safe Checks

1. Run `ctf-java-archive-map` for JAR/WAR layout.
2. Safe-extract the artifact.
3. Run `ctf-java-config-map` for context path, actuator, H2, Shiro, datasource, upload/static, and template clues.
4. Run `ctf-java-bytecode-hints` on `BOOT-INF/classes`, `WEB-INF/classes`, or the extracted app classes.
5. Use `ctf-java-decompile-targets` only on `Decompile Targets`: controller, servlet, filter, security/config, and sink classes.

## Bytecode Route/Sink Table

| Class | Role | Route / Annotation Hint | Input Hint | Sink Hint | Decompile Priority |
|---|---|---|---|---|---|

## Priority Rules

- Controller/Servlet route classes before services.
- Filter/Security/Shiro config before auth bypass probes.
- Config/application files before dependency CVE probes.
- Sink classes before broad decompilation.
- App package classes before third-party libraries.

## Stop Rules

- Do not decompile all dependencies before app route/sink evidence.
- Do not infer exploitability from class names alone; require route, controlled input, and sink.
- If `javap` hints are weak, combine config/dependency clues and decompile the smallest app package.
