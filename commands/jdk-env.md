---
description: "Daily utility: list or use local JDK environments for Java Web/Rev/CTF work"
agent: ctf-web
subtask: true
---

Use `ctf-java-jdk-env` to inspect or run local JDKs for Java Web/rev/CTF work.

Arguments:
$ARGUMENTS

JDK discovery:

- Set `CTF_JDK_ROOT` to the directory that holds your JDK installations
  (for example `C:\jdkenv` on Windows or `/opt/jdks` on Linux/macOS).
- The tool resolves version aliases against that root, so a layout like
  `<CTF_JDK_ROOT>/jdk-8u121`, `<CTF_JDK_ROOT>/jdk-11`, `<CTF_JDK_ROOT>/jdk-17`
  maps to aliases `8u121`, `11`, `17`.
- Common aliases: `7` / `7u21`, `8` / `8u121`, `8u65`, `11`, `17`, `24`.
  Only the versions actually present under `CTF_JDK_ROOT` are usable.

Typical tool actions:

- `list`: enumerate all configured JDKs and versions.
- `snippet`: emit a shell `JAVA_HOME`/`Path` snippet for one version.
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
