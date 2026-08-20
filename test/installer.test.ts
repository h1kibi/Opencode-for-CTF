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
  installedSkillDirs,
  managedFileHash,
  probeInstalledPluginRuntime,
  readJsonc,
  removeManagedFiles,
  profileFromArgs,
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

describe.sequential("managed installer", () => {
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
  "agent": { "user-agent": { "mode": "primary" } },
  "tools": { "user-tool": false }
}\n`,
    )

    const resources = await copyManagedFiles(configDir)
    const operations = await buildConfigOperations(await readJsonc(file), "safe", configDir)
    await applyConfigOperations(file, operations)

    const installed = await readJsonc(file)
    expect(await readFile(file, "utf8")).toContain("user comment must survive")
    expect(installed.agent["user-agent"].mode).toBe("primary")
    expect(installed.plugin.some((entry: string) => entry.includes("opencode-for-ctf/plugin/index.js"))).toBe(true)
    expect(installed.instructions).toContain(path.join(configDir, "opencode-for-ctf", "rules", "agent-equipment.md"))
    expect(installed.skills?.paths ?? []).toContain(path.join(configDir, "opencode-for-ctf", "skills"))
    expect(installed.tools["user-tool"]).toBe(false)
    expect(installed.tools["ctf-route-plan"]).toBe(true)
    expect(installed.tools["ctf-web-analyze"]).toBe(true)
    expect(installed.tools["ctf-python-inline"]).toBe(true)
    expect(existsSync(path.join(configDir, "agents", "ctf-expert.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "commands", "ctf.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "commands", "help.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "commands", "ctf-help.md"))).toBe(false)
    expect(existsSync(path.join(configDir, "commands", "resume.md"))).toBe(true)
    expect(existsSync(path.join(configDir, "commands", "ctf-resume.md"))).toBe(false)
    expect(existsSync(path.join(configDir, "commands", "ctf-web.md"))).toBe(false)
    expect(existsSync(path.join(configDir, "commands", "ctf-pwn.md"))).toBe(false)
    expect(resources.copied.some((entry: { path: string }) => entry.path === path.join("commands", "help.md"))).toBe(
      true,
    )
    expect(
      resources.copied.some((entry: { path: string }) => entry.path === path.join("commands", "ctf-help.md")),
    ).toBe(false)
    expect(resources.copied.some((entry: { path: string }) => entry.path === path.join("commands", "resume.md"))).toBe(
      true,
    )
    expect(
      resources.copied.some((entry: { path: string }) => entry.path === path.join("commands", "ctf-resume.md")),
    ).toBe(false)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "skills"))).toBe(true)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "plugin", "index.js"))).toBe(true)
    const managedWireMcpEntry = path.join(configDir, "opencode-for-ctf", "mcp-server", "vendor", "WireMCP", "index.js")
    expect(existsSync(managedWireMcpEntry)).toBe(true)
    expect(await readFile(managedWireMcpEntry, "utf8")).not.toMatch(/require\((['"])axios\1\)/)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "package.json"))).toBe(true)
    const pluginMetadata = JSON.parse(
      await readFile(path.join(configDir, "opencode-for-ctf", "package.json"), "utf8"),
    ) as { main?: string; opencode?: { type?: string } }
    expect(pluginMetadata.main).toBe("./plugin/index.js")
    expect(pluginMetadata.opencode?.type).toBe("plugin-runtime-bundle")
    await expect(probeInstalledPluginRuntime(configDir)).resolves.toMatchObject({ ok: true })
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "mcp-servers"))).toBe(false)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "runtime", "win-env", "setup_build_path.ps1"))).toBe(
      true,
    )
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "runtime", "state"))).toBe(false)

    await removeManagedFiles(configDir, resources)
    await revertConfigOperations(file, operations)
    expect(await readFile(path.join(configDir, "commands", "ctf.md"), "utf8")).toBe(priorCommand)
    expect((await readJsonc(file)).agent["user-agent"].mode).toBe("primary")
    expect((await readJsonc(file)).tools).toEqual({ "user-tool": false })
  }, 60_000)

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
    expect(valueAt(full, ["mcp", "wireshark-mcp"])?.enabled).toBe(false)
    expect(valueAt(full, ["mcp", "wireshark-mcp"])?.command).toEqual([
      "node",
      path.join(configDir, "opencode-for-ctf", "mcp-server", "vendor", "WireMCP", "index.js").replace(/\\/g, "/"),
    ])
    expect(valueAt(full, ["mcp", "cyberchef-mcp"])?.enabled).toBe(false)
    expect(valueAt(full, ["mcp", "ctfd-mcp"])?.enabled).toBe(false)
    expect(valueAt(full, ["mcp", "cyberchef-mcp"])?.command).toEqual(["{env:CYBERCHEF_MCP_COMMAND}"])
    expect(valueAt(full, ["mcp", "ctfd-mcp"])?.command).toEqual(["npx", "-y", "ctfd-mcp-server"])
    expect(valueAt(full, ["mcp", "ida-pro"])?.command).toEqual(["ida-pro-mcp"])
    for (const name of ["ida-pro", "jadx-mcp", "gdb-mcp", "mysql-mcp", "x64dbg-mcp", "ssh-mcp"]) {
      expect(valueAt(full, ["mcp", name])?.enabled).toBe(false)
    }
    expect(valueAt(full, ["mcp", "jadx-mcp"])?.command).toEqual(["{env:JADX_MCP_COMMAND}"])
    expect(valueAt(full, ["mcp", "gdb-mcp"])?.command).toEqual(["{env:GDB_MCP_COMMAND}"])
    expect(valueAt(full, ["mcp", "mysql-mcp"])?.command).toEqual(["{env:MYSQL_MCP_COMMAND}"])
    expect(valueAt(full, ["mcp", "x64dbg-mcp"])?.command).toEqual(["{env:X64DBG_MCP_COMMAND}"])
    expect(valueAt(full, ["mcp", "ssh-mcp"])?.command).toEqual(["{env:SSH_MCP_COMMAND}"])
  })

  it("defaults managed installation to the full disabled-MCP profile", () => {
    expect(profileFromArgs([])).toBe("full")
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
  }, 60_000)

  it("removes unchanged hidden category commands and preserves user-modified legacy commands during upgrade", async () => {
    const configDir = await temporaryDir("ctf-installer-hidden-command-upgrade-")
    const initial = await copyManagedFiles(configDir)
    const specialistCommands = [
      "ctf-web.md",
      "ctf-pwn.md",
      "ctf-rev.md",
      "ctf-crypto.md",
      "ctf-forensics.md",
      "ctf-misc.md",
    ]
    const copied = [...initial.copied]

    for (const command of specialistCommands) {
      const target = path.join(configDir, "commands", command)
      await writeFile(target, `legacy managed ${command}\n`)
      copied.push({ path: path.join("commands", command), sha256: await managedFileHash(target) })
    }

    const modified = path.join(configDir, "commands", "ctf-web.md")
    await writeFile(modified, "user customization\n")

    const result = await upgradeManagedFiles(configDir, { ...initial, copied })
    expect(result.preserved).toContain(path.join("commands", "ctf-web.md"))
    expect(await readFile(modified, "utf8")).toBe("user customization\n")
    for (const command of specialistCommands.filter((command) => command !== "ctf-web.md")) {
      expect(existsSync(path.join(configDir, "commands", command)), command).toBe(false)
    }
    await result.commit()
  }, 60_000)

  it("legacy setup removes hidden category commands after preserving backups", async () => {
    const configDir = await temporaryDir("ctf-legacy-setup-hidden-command-")
    const outputPath = path.join(configDir, "generated", "opencode.json")
    const specialistCommands = [
      "ctf-web.md",
      "ctf-pwn.md",
      "ctf-rev.md",
      "ctf-crypto.md",
      "ctf-forensics.md",
      "ctf-misc.md",
    ]
    await mkdir(path.join(configDir, "commands"), { recursive: true })
    for (const command of specialistCommands) {
      await writeFile(path.join(configDir, "commands", command), `legacy setup ${command}\n`)
    }

    const result = spawnSync(process.execPath, [path.resolve("scripts/setup.mjs")], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_SETUP_OUTPUT: outputPath,
        PLUGIN_DIR: path.resolve("."),
        WORKSPACE_DIR: configDir,
      },
    })
    expect(result.status, result.stderr).toBe(0)
    for (const command of specialistCommands) {
      const target = path.join(configDir, "commands", command)
      expect(existsSync(target), command).toBe(false)
      expect(await readFile(`${target}.bak-opencode-for-ctf`, "utf8"), command).toBe(`legacy setup ${command}\n`)
    }
  })

  it("refreshes modified plugin bundle files during upgrade", async () => {
    const configDir = await temporaryDir("ctf-installer-plugin-refresh-")
    const initial = await copyManagedFiles(configDir)
    const bundleEntry = initial.copied.find((entry: { path: string }) =>
      String(entry.path).replace(/\\/g, "/").startsWith("opencode-for-ctf/plugin/chunks/"),
    )
    expect(bundleEntry).toBeDefined()
    const target = path.join(configDir, bundleEntry!.path)
    const original = await readFile(target, "utf8")
    await writeFile(target, "user modification inside generated bundle\n")

    const result = await upgradeManagedFiles(configDir, initial)
    expect(result.preserved).not.toContain(bundleEntry!.path)
    expect(await readFile(target, "utf8")).toBe(original)
    await result.commit()
  }, 60_000)

  it("keeps the external reference corpus out of active skill paths", async () => {
    const configDir = await temporaryDir("ctf-installer-skill-paths-")
    const paths = installedSkillDirs(configDir).map((entry: string) => entry.replace(/\\/g, "/"))
    expect(paths).toEqual([`${configDir.replace(/\\/g, "/")}/opencode-for-ctf/skills`])
    expect(paths.join(" ")).not.toContain("skills-external/secknowledge-skill")
  })

  it("only installs external skills when explicitly requested", async () => {
    const configDir = await temporaryDir("ctf-installer-external-")
    const initial = await copyManagedFiles(configDir)
    expect(initial.copied.some((entry: { path: string }) => entry.path.includes(`skills-external${path.sep}`))).toBe(
      false,
    )
    await removeManagedFiles(configDir, initial)

    process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS = "1"
    const withExternal = await copyManagedFiles(configDir)
    const externalSourceExists = existsSync(path.resolve("skills-external", "secknowledge-skill"))
    expect(
      withExternal.copied.some((entry: { path: string }) =>
        entry.path.includes(path.join("skills-external", "secknowledge-skill") + path.sep),
      ),
    ).toBe(externalSourceExists)
  }, 60_000)

  it("installs slim knowledge without intermediate pattern-card history", async () => {
    const configDir = await temporaryDir("ctf-installer-slim-knowledge-")
    const resources = await copyManagedFiles(configDir)
    const patternDir = path.join(configDir, "opencode-for-ctf", "rag", "knowledge", "pattern-cards")
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.v9.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "synonyms.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "pwn-curated.cards.v1.json"))).toBe(true)
    expect(existsSync(path.join(patternDir, "des-ctf", "des-ctf.cards.v1.json"))).toBe(true)
    expect(
      existsSync(path.join(configDir, "opencode-for-ctf", "rag", "knowledge", "retros", "retros.index.json")),
    ).toBe(true)
    expect(
      existsSync(
        path.join(configDir, "opencode-for-ctf", "rag", "knowledge", "sources", "des-ctf-knowledge.manifest.json"),
      ),
    ).toBe(true)
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.v8.json"))).toBe(false)
    expect(existsSync(path.join(patternDir, "ljagiello-ctf-skills.cards.json"))).toBe(false)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "rag", "knowledge", "imported"))).toBe(false)
    expect(existsSync(path.join(configDir, "opencode-for-ctf", "rag", "Des-CTF-Knowledge"))).toBe(false)
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
    expect(install.stdout).toContain("user-selectable CTF agents: ctf-fast, ctf-expert")
    expect(install.stdout).toContain("hidden internal subagents")
    expect(existsSync(path.join(configDir, "opencode-for-ctf.manifest.json"))).toBe(true)
    const healthFile = path.join(configDir, "opencode-for-ctf.plugin-health.json")
    expect(existsSync(healthFile)).toBe(true)
    expect(JSON.parse(await readFile(healthFile, "utf8"))).toMatchObject({
      source: "install",
      state: "installed",
      pluginImportOk: true,
    })

    const status = run("status.mjs", ["--json", "--strict"])
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({
      state: "installed",
      profile: "full",
      pluginRegistered: true,
      skillPathsRegistered: true,
      mcpStubsRegistered: true,
      pluginDiagnostic: {
        installedPluginPresent: true,
        pluginImportOk: true,
        sourcePluginRisk: false,
      },
    })
    expect(JSON.parse(await readFile(healthFile, "utf8"))).toMatchObject({
      source: "status",
      state: "installed",
      pluginRegistered: true,
    })

    const installedConfig = await readJsonc(file)
    expect(installedConfig.skills?.paths ?? []).toContain(path.join(configDir, "opencode-for-ctf", "skills"))

    const upgrade = run("upgrade.mjs")
    expect(upgrade.status, upgrade.stderr).toBe(0)

    const uninstall = run("uninstall.mjs")
    expect(uninstall.status, uninstall.stderr).toBe(0)
    expect(existsSync(path.join(configDir, "opencode-for-ctf.manifest.json"))).toBe(false)
    expect(await readFile(file, "utf8")).toContain("retained by the lifecycle")
    expect((await readJsonc(file)).default_agent).toBe("user-agent")
  }, 60_000)
})
