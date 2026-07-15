---
description: Daily utility: List or use local C:\Projects\jdkenv JDK environments
agent: ctf-web
subtask: true
---

Use `ctf-java-jdk-env` to inspect or run local JDKs for Java Web/rev/CTF work.

Arguments:
$ARGUMENTS

Known JDK aliases:

- `7` / `7u21` -> `C:\Projects\jdkenv\jdk-7u21`
- `8` / `8u121` -> `C:\Projects\jdkenv\jdk-8u121`
- `8u65` -> `C:\Projects\jdkenv\jdk-8u65`
- `11` -> `C:\Projects\jdkenv\jdk-11`
- `17` -> `C:\Projects\jdkenv\jdk-17`
- `24` -> `C:\Projects\jdkenv\jdk-24`

Typical tool actions:

- `list`: enumerate all configured JDKs and versions.
- `snippet`: emit a PowerShell `JAVA_HOME`/`Path` snippet for one version.
- `version`: run `java -version` for one version.
- `jar-list`: list a workspace-relative JAR/WAR with selected JDK's `jar`.
- `javap`: inspect a workspace-relative `.class` file.
- `run-jar`: run a workspace-relative jar with selected JDK.
- `compile`: compile a workspace-relative `.java` file with selected JDK.

Default guidance:

- Use JDK 8 for legacy gadget/ysoserial/Shiro-era compatibility.
- Use JDK 7u21/8u65/8u121 for old exploit compatibility checks.
- Use JDK 11/17/24 for modern Spring Boot or class-version compatibility.
- Keep environment changes per command; do not modify global system Java.
