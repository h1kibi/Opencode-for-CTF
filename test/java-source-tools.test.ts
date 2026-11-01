import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const POM = [
  "<project>",
  "  <modelVersion>4.0.0</modelVersion>",
  "  <groupId>com.demo</groupId>",
  "  <artifactId>demo</artifactId>",
  "  <version>1.0.0</version>",
  "  <dependencies>",
  "    <dependency><groupId>org.apache.log4j</groupId><artifactId>log4j-core</artifactId><version>2.14.1</version></dependency>",
  "    <dependency><groupId>com.fasterxml.jackson.core</groupId><artifactId>jackson-databind</artifactId><version>2.9.10</version></dependency>",
  "  </dependencies>",
  "</project>",
  "",
].join("\n")

const CONTROLLER = [
  "package com.demo;",
  "",
  "import javax.servlet.http.HttpServletRequest;",
  "import java.sql.Statement;",
  "",
  "public class AdminController {",
  "  private Statement statement;",
  "",
  "  public String getUser(HttpServletRequest request) throws Exception {",
  '    String id = request.getParameter("id");',
  '    return statement.executeQuery("SELECT * FROM users WHERE id=" + id).toString();',
  "  }",
  "",
  "  public String health() {",
  '    return "ok";',
  "  }",
  "}",
  "",
].join("\n")

const APPLICATION_YML = [
  "spring:",
  "  datasource:",
  "    url: jdbc:mysql://db:3306/demo",
  "    username: root",
  "    password: supersecret",
  "server:",
  "  port: 8080",
  "",
].join("\n")

async function makeProject(workspace: string) {
  const java = path.join(workspace, "src", "main", "java", "com", "demo")
  const resources = path.join(workspace, "src", "main", "resources")
  await mkdir(java, { recursive: true })
  await mkdir(resources, { recursive: true })
  await writeFile(path.join(workspace, "pom.xml"), POM, "utf8")
  await writeFile(path.join(java, "AdminController.java"), CONTROLLER, "utf8")
  await writeFile(path.join(resources, "application.yml"), APPLICATION_YML, "utf8")
}

describe("java source tools", () => {
  it("attributes a servlet input to the method that declares it", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-java-map")
    try {
      await makeProject(workspace)
      const module = await import("../tools/java/ctf-java-map.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ dir: "src/main/java" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("in AdminController.getUser")
      expect(text).toContain("sql-sink:")
      expect(text).toContain("AdminController.java")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("flattens config keys and never echoes the secret value", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-java-config")
    try {
      await makeProject(workspace)
      const module = await import("../tools/java/ctf-java-config-map.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "src/main/resources" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("config_files: 1")
      expect(text).toContain("spring.datasource.url: jdbc:mysql://db:3306/demo")
      expect(text).toContain("spring.datasource.password: <redacted:11 chars>")
      expect(text).toContain("## Attack Queue Seed")
      expect(text).not.toContain("supersecret")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("flags the risky dependency versions from a pom", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-java-dep")
    try {
      await makeProject(workspace)
      const module = await import("../tools/java/ctf-java-dep-risk.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "pom.xml" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("dependency_files: 1")
      expect(text).toContain("dependencies_seen: 2")
      expect(text).toContain("dependency: log4j-core (version=2.14.1)")
      expect(text).toContain("first_safe_check:")
      expect(text).toContain("dependency: jackson-databind (version=2.9.10)")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("slices source files by the requested sink focus", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-java-slice")
    try {
      await makeProject(workspace)
      const module = await import("../tools/java/ctf-java-source-slice.ts")
      const execute = module.default.execute as Execute

      const text = await execute(
        { target: "src/main/java", focus: "sql" },
        {
          directory: workspace,
          worktree: workspace,
        },
      )

      expect(text).toContain("files_scanned: 1")
      expect(text).toContain("focus: sql")
      expect(text).toMatch(/## Sink Files\n- sink: sql com\/demo\/AdminController\.java class=AdminController hits=1/)
      expect(text).toContain("## Source Slices")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
