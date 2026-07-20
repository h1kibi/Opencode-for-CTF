import { existsSync } from "node:fs"
import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  configPath,
  ensurePluginBuild,
  installedPluginFile,
  managedFileHash,
  manifestPath,
  opencodeConfigDir,
  projectVersion,
  readJsonc,
} from "./lib/opencode-ctf-install.mjs"

async function pluginRuntimeDiagnostic(configDir, config) {
  const installed = installedPluginFile(configDir)
  const installedUrl = pathToFileURL(installed).href
  const pluginEntries = Array.isArray(config.plugin) ? config.plugin : []
  const pluginStrings = pluginEntries.map((entry) => (Array.isArray(entry) ? entry[0] : entry)).filter((entry) => typeof entry === "string")
  const rawSourcePlugin = pluginStrings.find((entry) => typeof entry === "string" && entry.startsWith("file:") && !entry.endsWith("/plugin/index.js") && !entry.endsWith("\\plugin\\index.js"))

  const diagnostics = {
    installedPluginFile: installed,
    installedPluginUrl: installedUrl,
    sourcePluginConfigured: rawSourcePlugin ?? null,
    sourcePluginRisk: Boolean(rawSourcePlugin),
    installedPluginPresent: existsSync(installed),
    bundledPluginPresent: false,
    nextAction: "",
  }

  try {
    await ensurePluginBuild()
    diagnostics.bundledPluginPresent = true
  } catch {
    diagnostics.bundledPluginPresent = false
  }

  if (diagnostics.sourcePluginRisk) {
    diagnostics.nextAction =
      "Config points OpenCode at a source checkout via file:/.../Opencode-for-CTF. Prefer the managed installed bundle (.../opencode-for-ctf/plugin/index.js) because source mode can trigger host-side dependency installs such as @opencode-ai/plugin@local."
  } else if (!diagnostics.installedPluginPresent) {
    diagnostics.nextAction =
      "Managed plugin bundle is missing from the OpenCode config directory. Re-run npm run ctf:install or npm run ctf:upgrade."
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
  const result = { state: "not installed", configDir, config: file, manifest: manifestFile, currentVersion }
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
  const pluginDiagnostic = await pluginRuntimeDiagnostic(configDir, config)
  const agents = expectedFiles
    .map((entry) => (typeof entry === "string" ? entry : entry.path))
    .filter((entry) => entry.startsWith(`agents${path.sep}`) && entry.endsWith(".md"))
  const commands = expectedFiles
    .map((entry) => (typeof entry === "string" ? entry : entry.path))
    .filter((entry) => entry.startsWith(`commands${path.sep}`) && entry.endsWith(".md"))
  const result = {
    state: missingFiles.length || modifiedFiles.length || !pluginRegistered ? "degraded" : "installed",
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
    pluginDiagnostic,
  }
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
    console.log(`plugin_bundle_present: ${result.pluginDiagnostic.installedPluginPresent ? "yes" : "no"}`)
    console.log(`bundled_build_present: ${result.pluginDiagnostic.bundledPluginPresent ? "yes" : "no"}`)
    console.log(`source_plugin_configured: ${result.pluginDiagnostic.sourcePluginConfigured ?? "no"}`)
    console.log(`plugin_runtime_note: ${result.pluginDiagnostic.nextAction}`)
  }
  if (strict && result.state !== "installed") process.exitCode = 1
}
