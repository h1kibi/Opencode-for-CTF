import { execFile, spawnSync } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const run = promisify(execFile)

const hasJdk = ["javac", "javap"].every((tool) => spawnSync(tool, ["-version"], { encoding: "utf8" }).status === 0)
const hasJar = spawnSync("jar", ["--version"], { encoding: "utf8" }).status === 0

const SOURCE = [
  "package com.demo;",
  "",
  "public class AdminController {",
  '  private static final String ROUTE = "/admin/flag";',
  '  private static final String FLAG = "flag{jar_admin_secret}";',
  "",
  "  public String get() {",
  '    return ROUTE + " " + FLAG;',
  "  }",
  "}",
  "",
].join("\n")

describe.skipIf(!hasJdk || !hasJar)("java archive tools", () => {
  let workspace = ""
  const context = () => ({ directory: workspace, worktree: workspace })

  beforeAll(async () => {
    workspace = await makeTestWorkspaceAsync("ctf-java-archive")
    const source = path.join(workspace, "src", "com", "demo")
    await mkdir(source, { recursive: true })
    await writeFile(path.join(source, "AdminController.java"), SOURCE, "utf8")
    await run("javac", ["-d", "classes", path.join("src", "com", "demo", "AdminController.java")], {
      cwd: workspace,
    })
    await run("jar", ["cf", "admin.jar", "-C", "classes", "."], { cwd: workspace })
  }, 120_000)

  afterAll(async () => {
    if (workspace) await rm(workspace, { recursive: true, force: true })
  })

  it("maps a real jar into layout, metadata, and class samples", async () => {
    const module = await import("../tools/java/ctf-java-archive-map.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ target: "admin.jar" }, context())

    expect(text).toContain("# Java Archive Map")
    expect(text).toMatch(/^entries: \d+/m)
    expect(text).toContain("layout: plain-jar")
    expect(text).toContain("- META-INF/MANIFEST.MF")
    expect(text).toContain("com/demo/AdminController.class")
    expect(text).toContain("## Attack Queue Seed")
  })

  it("names role and route classes from compiled bytecode", async () => {
    const module = await import("../tools/java/ctf-java-bytecode-hints.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ target: "classes" }, context())

    expect(text).toContain("class_files: 1")
    expect(text).toContain("## Role-like Classes\n- com/demo/AdminController.class")
    expect(text).toContain("## Route Hint Classes\n- com/demo/AdminController.class")
    expect(text).toContain("public class com.demo.AdminController")
  })

  it("classifies a jar as an artifact and points at the archive map first", async () => {
    const module = await import("../tools/java/ctf-java-analyze.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ target: "admin.jar" }, context())

    expect(text).toContain("# CTF Java Analyze Pack")
    expect(text).toContain("lane: artifact")
    expect(text).toContain("files_seen: 1")
    expect(text).toContain("ctf-java-archive-map before extraction")
  })
})
