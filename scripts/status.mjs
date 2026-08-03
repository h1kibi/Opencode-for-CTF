import { existsSync } from "node:fs"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  configPath,
  ensurePluginBuild,
  installedPluginFile,
  installedSkillDirs,
  managedFileHash,
  manifestPath,
  opencodeConfigDir,
  pluginHealthPath,
  probeInstalledPluginRuntime,
  projectVersion,
  readJsonc,
  tryWritePluginHealthReport,
} from "./lib/opencode-ctf-install.mjs"
import { PROFILE_MCP } from "./lib/install-defaults.mjs"

async function pluginRuntimeDiagnostic(configDir, config) {
  const installed = installedPluginFile(configDir)
  const installedUrl = pathToFileURL(installed).href
  const pluginEntries = Array.isArray(config.plugin) ? config.plugin : []
  const pluginStrings = pluginEntries
    .map((entry) => (Array.isArray(entry) ? entry[0] : entry))
    .filter((entry) => typeof entry === "string")
  const rawSourcePlugin = pluginStrings.find(
    (entry) =>
      typeof entry === "string" &&
      entry.startsWith("file:") &&
      !entry.endsWith("/plugin/index.js") &&
      !entry.endsWith("\\plugin\\index.js"),
  )

  const diagnostics = {
    installedPluginFile: installed,
    installedPluginUrl: installedUrl,
    sourcePluginConfigured: rawSourcePlugin ?? null,
    sourcePluginRisk: Boolean(rawSourcePlugin),
    installedPluginPresent: existsSync(installed),
    bundledPluginPresent: false,
    pluginImportOk: false,
    pluginImportError: null,
    pluginExportNames: [],
    nextAction: "",
  }

  try {
    await ensurePluginBuild()
    diagnostics.bundledPluginPresent = true
  } catch {
    diagnostics.bundledPluginPresent = false
  }

  if (diagnostics.installedPluginPresent) {
    const probe = await probeInstalledPluginRuntime(configDir)
    diagnostics.pluginImportOk = probe.ok
    diagnostics.pluginImportError = probe.ok ? null : probe.error
    diagnostics.pluginExportNames = probe.exportNames ?? []
  }

  if (diagnostics.sourcePluginRisk) {
    diagnostics.nextAction =
      "Config points OpenCode at a source checkout via file:/.../Opencode-for-CTF. Prefer the managed installed bundle (.../opencode-for-ctf/plugin/index.js) because source mode can trigger host-side dependency installs such as @opencode-ai/plugin@local."
  } else if (!diagnostics.installedPluginPresent) {
    diagnostics.nextAction =
      "Managed plugin bundle is missing from the OpenCode config directory. Re-run npm run ctf:install or npm run ctf:upgrade."
  } else if (!diagnostics.pluginImportOk) {
    diagnostics.nextAction = `Managed plugin bundle exists but cannot be imported: ${diagnostics.pluginImportError}. Re-run npm run build:plugin && npm run ctf:upgrade, then restart OpenCode.`
  } else {
    diagnostics.nextAction =
      "Managed plugin bundle path is present. If tools are still missing, restart OpenCode and inspect host logs for plugin dependency/runtime errors."
  }

  return diagnostics
}

const configDir = opencodeConfigDir()
const json = process.argv.includes("--json")
const strict = process.argv.includes("--strict")
const manifestFile = manifestPath(configDir)
const currentVersion = await projectVersion()

if (!existsSync(manifestFile)) {
  const file = configPath(configDir)
  const result = {
    state: "not installed",
    configDir,
    config: file,
    manifest: manifestFile,
    currentVersion,
    healthFile: pluginHealthPath(configDir),
  }
  await tryWritePluginHealthReport(configDir, {
    source: "status",
    state: result.state,
    config: result.config,
    manifest: result.manifest,
  })
  console.log(json ? JSON.stringify(result, null, 2) : `state: not installed\nhint: run npm run ctf:install`)
  if (strict) process.exitCode = 1
} else {
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
  const file = manifest.config ?? configPath(configDir)
  const config = await readJsonc(file)
  const expectedFiles = manifest.copied ?? []
  const missingFiles = expectedFiles.filter(
    (entry) => !existsSync(path.join(configDir, typeof entry === "string" ? entry : entry.path)),
  )
  const modifiedFiles = []
  for (const entry of expectedFiles) {
    if (typeof entry === "string" || !entry.sha256) continue
    const target = path.join(configDir, entry.path)
    if (existsSync(target) && (await managedFileHash(target)) !== entry.sha256) modifiedFiles.push(entry.path)
  }
  const pluginSpec = pathToFileURL(installedPluginFile(configDir)).href
  const pluginRegistered =
    Array.isArray(config.plugin) &&
    config.plugin.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === pluginSpec)
  const configuredSkillPaths = Array.isArray(config.skills?.paths) ? config.skills.paths : []
  const expectedSkillPaths = installedSkillDirs(configDir)
  const missingSkillPaths = expectedSkillPaths.filter(
    (skillPath) => !configuredSkillPaths.some((entry) => entry === skillPath),
  )
  const skillPathsRegistered = missingSkillPaths.length === 0
  const pluginDiagnostic = await pluginRuntimeDiagnostic(configDir, config)
  const expectedMcpEntries = PROFILE_MCP[manifest.profile] ?? []
  const configuredMcp = config.mcp && typeof config.mcp === "object" ? config.mcp : {}
  const missingMcpEntries = expectedMcpEntries.filter(
    (name) => !Object.prototype.hasOwnProperty.call(configuredMcp, name),
  )
  const mcpStubsRegistered = missingMcpEntries.length === 0
  const agents = expectedFiles
    .map((entry) => (typeof entry === "string" ? entry : entry.path))
    .filter((entry) => entry.startsWith(`agents${path.sep}`) && entry.endsWith(".md"))
  const commands = expectedFiles
    .map((entry) => (typeof entry === "string" ? entry : entry.path))
    .filter((entry) => entry.startsWith(`commands${path.sep}`) && entry.endsWith(".md"))
  const result = {
    state:
      missingFiles.length ||
      modifiedFiles.length ||
      !pluginRegistered ||
      !skillPathsRegistered ||
      !mcpStubsRegistered ||
      !pluginDiagnostic.pluginImportOk
        ? "degraded"
        : "installed",
    profile: manifest.profile ?? "unknown",
    version: manifest.version ?? "legacy",
    schemaVersion: manifest.schemaVersion ?? 1,
    currentVersion,
    upgradeAvailable: (manifest.version ?? "legacy") !== currentVersion,
    installedAt: manifest.installedAt ?? "unknown",
    configDir,
    config: file,
    managedFiles: expectedFiles.length,
    missingFiles: missingFiles.map((entry) => (typeof entry === "string" ? entry : entry.path)),
    modifiedFiles,
    agents: agents.length,
    commands: commands.length,
    pluginRegistered,
    skillPathsRegistered,
    mcpStubsRegistered,
    expectedMcpEntries,
    missingMcpEntries,
    expectedSkillPaths,
    missingSkillPaths,
    pluginDiagnostic,
    healthFile: pluginHealthPath(configDir),
  }
  await tryWritePluginHealthReport(configDir, {
    source: "status",
    state: result.state,
    profile: result.profile,
    config: result.config,
    pluginDiagnostic: result.pluginDiagnostic,
    pluginRegistered: result.pluginRegistered,
    skillPathsRegistered: result.skillPathsRegistered,
    mcpStubsRegistered: result.mcpStubsRegistered,
    missingFiles: result.missingFiles,
    modifiedFiles: result.modifiedFiles,
  })
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log("# OpenCode for CTF status")
    console.log(`state: ${result.state}`)
    console.log(`version: ${result.version} (project ${result.currentVersion})`)
    console.log(`profile: ${result.profile}`)
    console.log(`managed_files: ${result.managedFiles}`)
    console.log(`missing_files: ${result.missingFiles.length}`)
    console.log(`modified_files: ${result.modifiedFiles.length}`)
    console.log(`agents: ${result.agents}`)
    console.log(`commands: ${result.commands}`)
    console.log(`plugin_registered: ${result.pluginRegistered ? "yes" : "no"}`)
    console.log(`skill_paths_registered: ${result.skillPathsRegistered ? "yes" : "no"}`)
    if (result.missingSkillPaths.length) console.log(`missing_skill_paths: ${result.missingSkillPaths.join(", ")}`)
    console.log(`mcp_stubs_registered: ${result.mcpStubsRegistered ? "yes" : "no"}`)
    if (result.missingMcpEntries.length) console.log(`missing_mcp_stubs: ${result.missingMcpEntries.join(", ")}`)
    console.log(`plugin_bundle_present: ${result.pluginDiagnostic.installedPluginPresent ? "yes" : "no"}`)
    console.log(`bundled_build_present: ${result.pluginDiagnostic.bundledPluginPresent ? "yes" : "no"}`)
    console.log(`plugin_import_ok: ${result.pluginDiagnostic.pluginImportOk ? "yes" : "no"}`)
    if (!result.pluginDiagnostic.pluginImportOk && result.pluginDiagnostic.pluginImportError) {
      console.log(`plugin_import_error: ${result.pluginDiagnostic.pluginImportError}`)
    }
    console.log(`health_file: ${result.healthFile}`)
    console.log(`source_plugin_configured: ${result.pluginDiagnostic.sourcePluginConfigured ?? "no"}`)
    console.log(`plugin_runtime_note: ${result.pluginDiagnostic.nextAction}`)
  }
  if (strict && result.state !== "installed") process.exitCode = 1
}
