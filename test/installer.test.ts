import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// The installer is intentionally plain ESM so the published CLI runs without tsx.
// @ts-expect-error The runtime module does not ship TypeScript declarations.
import * as installerModule from "../scripts/lib/opencode-ctf-install.mjs"

const {
  applyConfigOperations,
  buildConfigOperations,
  configPath,
  copyManagedFiles,
  readJsonc,
  removeManagedFiles,
  revertConfigOperations,
  upgradeManagedFiles,
} = installerModule

const temporaryDirs: string[] = []

async function temporaryDir(prefix: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirs.push(directory)
  return directory
}

afterEach(async () => {
  delete process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS
  await Promise.all(temporaryDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("managed installer", () => {
  it("maps the new assets, preserves JSONC comments, and restores prior files", async () => {
    const configDir = await temporaryDir("ctf-installer-")
    const file = configPath(configDir)
    const priorCommand = "user command\n"
    await mkdir(path.join(configDir, "commands"), { recursive: true })
    await writeFile(path.join(configDir, "commands", "ctf.md"), priorCommand)
    await writeFile(
      file,
      `{
  // user comment must survive
  "$schema": "https://opencode.ai/config.json",
  "agent": { "user-agent": { "mode": "primary" } }
}\n`,
    )

    const resources = await copyManagedFiles(configDir)
    const operations = await buildConfigOperations(await readJsonc(file), "safe", configDir)
    await applyConfigOperations(file, operations)

    const installed = await readJsonc(file)
    expect(await readFile(file, "utf8")).toContain("user comment must survive")
    expect(installed.agent["user-agent"].mode).toBe("primary")
    expect(installed.plugin.some((entry: string) => entry.includes("opencode-for-ctf/plugin/index.js"))).toBe(true)
    expect(installed.skills.paths).toContain(path.join(configDir, "opencode-for-ctf", "skills"))
    expect(existsSync(path.join(configDir, "agents", "ctf-expert.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "commands", "ctf.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "skills"))).toBe(true)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "plugin", "index.js"))).toBe(true)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "mcp-servers", "wireshark-mcp", "server.js"))).toBe(
      true,
    )
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "runtime", "win-env", "setup_build_path.ps1"))).toBe(
      true,
    )
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "runtime", "state"))).toBe(false)

    await removeManagedFiles(configDir, resources)
    await revertConfigOperations(file, operations)
    expect(await readFile(path.join(configDir, "commands", "ctf.md"), "utf8")).toBe(priorCommand)
    expect((await readJsonc(file)).agent["user-agent"].mode).toBe("primary")
  }, 30_000)

  it("removes parent objects created by config installation", async () => {
    const configDir = await temporaryDir("ctf-config-rollback-")
    const file = configPath(configDir)
    await writeFile(file, "{}\n")
    const operations = await buildConfigOperations({}, "safe", configDir)
    await applyConfigOperations(file, operations)
    await revertConfigOperations(file, operations)
    expect(await readJsonc(file)).toEqual({})
  })

  it("keeps profile MCP definitions disabled and strips machine-specific values", async () => {
    const configDir = await temporaryDir("ctf-profile-")
    const safe = await buildConfigOperations({}, "safe", configDir)
    const web = await buildConfigOperations({}, "web", configDir)
    const full = await buildConfigOperations({}, "full", configDir)
    const valueAt = (operations: Array<{ path: string[]; value: unknown }>, selectedPath: string[]) =>
      operations.find((entry) => JSON.stringify(entry.path) === JSON.stringify(selectedPath))?.value as
        Record<string, unknown> | undefined

    expect(valueAt(safe, ["mcp", "browser"])).toBeUndefined()
    expect(valueAt(web, ["mcp", "browser"])?.enabled).toBe(false)
    expect(valueAt(full, ["mcp", "ReVa"])?.enabled).toBe(false)
    expect(valueAt(full, ["mcp", "ReVa"])?.environment).toBeUndefined()
    expect(valueAt(full, ["mcp", "ida-pro"])).toBeUndefined()
  })

  it("refuses managed files through a symlinked target directory", async () => {
    const configDir = await temporaryDir("ctf-installer-link-")
    const outside = await temporaryDir("ctf-installer-outside-")
    await symlink(outside, path.join(configDir, "commands"), process.platform === "win32" ? "junction" : "dir")
    await expect(copyManagedFiles(configDir)).rejects.toThrow(/symlink or junction/i)
  })

  it("refreshes unchanged files and preserves user-modified files during upgrade", async () => {
    const configDir = await temporaryDir("ctf-installer-upgrade-")
    const initial = await copyManagedFiles(configDir)
    const modified = path.join(configDir, "commands", "ctf.md")
    await writeFile(modified, "user customization\n")

    const result = await upgradeManagedFiles(configDir, initial)
    expect(result.preserved).toContain(path.join("commands", "ctf.md"))
    expect(await readFile(modified, "utf8")).toBe("user customization\n")
    await result.commit()
  }, 30_000)

  it("only installs external skills when explicitly requested", async () => {
    const configDir = await temporaryDir("ctf-installer-external-")
    const initial = await copyManagedFiles(configDir)
    expect(initial.copied.some((entry: { path: string }) => entry.path.includes(`skills-external${path.sep}`))).toBe(
      false,
    )
    await removeManagedFiles(configDir, initial)

    process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS = "1"
    const withExternal = await copyManagedFiles(configDir)
    const externalSourceExists = existsSync(path.resolve("skills-external", "ctf-skills"))
    expect(
      withExternal.copied.some((entry: { path: string }) => entry.path.includes(`skills-external${path.sep}`)),
    ).toBe(externalSourceExists)
  }, 60_000)

  it("installs slim knowledge without intermediate pattern-card history", async () => {
    const configDir = await temporaryDir("ctf-installer-slim-knowledge-")
    const resources = await copyManagedFiles(configDir)
    const patternDir = path.join(configDir, "opencode-for-ctf", "knowledge", "pattern-cards")
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.v9.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "synonyms.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "pwn-curated.cards.v1.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.v8.json"))).toBe(false)
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.json"))).toBe(false)
    expect(existsSync(path.join(patternDir, "curation-candidates.json"))).toBe(false)
    expect(
      resources.copied.some((entry: { path: string }) =>
        String(entry.path).replace(/\\/g, "/").includes("ljagiello-ctf-skills.cards.v8.json"),
      ),
    ).toBe(false)
  }, 30_000)

  it("runs the managed CLI lifecycle in an isolated config directory", async () => {
    const configDir = await temporaryDir("ctf-installer-cli-")
    const file = configPath(configDir)
    await writeFile(file, '{\n  // retained by the lifecycle\n  "default_agent": "user-agent"\n}\n')
    const environment: NodeJS.ProcessEnv = { ...process.env, OPENCODE_CONFIG_DIR: configDir }
    delete environment.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS
    const run = (script: string, args: string[] = []) =>
      spawnSync(process.execPath, [path.resolve("scripts", script), ...args], {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: environment,
      })

    const install = run("install.mjs")
    expect(install.status, install.stderr).toBe(0)
    expect(existsSync(path.join(configDir, "opencode-for-ctf.manifest.json"))).toBe(true)

    const status = run("status.mjs", ["--json", "--strict"])
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({ state: "installed", pluginRegistered: true })

    const upgrade = run("upgrade.mjs")
    expect(upgrade.status, upgrade.stderr).toBe(0)

    const uninstall = run("uninstall.mjs")
    expect(uninstall.status, uninstall.stderr).toBe(0)
    expect(existsSync(path.join(configDir, "opencode-for-ctf.manifest.json"))).toBe(false)
    expect(await readFile(file, "utf8")).toContain("retained by the lifecycle")
    expect((await readJsonc(file)).default_agent).toBe("user-agent")
  }, 60_000)
})
