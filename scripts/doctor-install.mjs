import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  commandExists,
  configPath,
  manifestPath,
  opencodeConfigDir,
  pluginHealthPath,
  probeInstalledPluginRuntime,
  projectVersion,
  readJsonc,
  repoRoot,
  tryWritePluginHealthReport,
} from "./lib/opencode-ctf-install.mjs"
import { runToolChecks, TOOL_CHECK_GROUPS } from "./lib/tool-checks.mjs"
import { wireMcpBackendStatus } from "./lib/wiremcp-status.mjs"

const json = process.argv.includes("--json")
const strict = process.argv.includes("--strict")
const groups = runToolChecks()

const configDir = opencodeConfigDir()
const configFile = configPath(configDir)
const manifestFile = manifestPath(configDir)
const installed = existsSync(manifestFile)
const currentVersion = await projectVersion()
let configError = null
let installedVersion = null
let config = {}
try {
  config = await readJsonc(configFile)
} catch (error) {
  configError = error instanceof Error ? error.message : String(error)
}
if (installed) {
  try {
    installedVersion = JSON.parse(await readFile(manifestFile, "utf8")).version ?? "legacy"
  } catch (error) {
    configError = `Invalid installation manifest: ${error instanceof Error ? error.message : String(error)}`
  }
}

const wireMcp = wireMcpBackendStatus()
const pluginRuntimeProbe = existsSync(path.join(configDir, "opencode-for-ctf", "plugin", "index.js"))
  ? await probeInstalledPluginRuntime(configDir)
  : { ok: false, error: "managed plugin bundle missing", exportNames: [] }
const result = {
  configDir,
  configFile,
  manifestFile,
  healthFile: pluginHealthPath(configDir),
  installed,
  openCode: commandExists("opencode", ["--version"]),
  nodeModules: existsSync(path.join(repoRoot, "node_modules")),
  pluginBundle: existsSync(path.join(repoRoot, "dist", "plugin", "index.js")),
  configError,
  currentVersion,
  installedVersion,
  upgradeAvailable: installed && installedVersion !== currentVersion,
  pluginRuntimeImportOk: pluginRuntimeProbe.ok,
  pluginRuntimeImportError: pluginRuntimeProbe.ok ? null : pluginRuntimeProbe.error,
  wireMcpConfigured: wireMcp.configured,
  groups: Object.fromEntries(groups),
}
await tryWritePluginHealthReport(configDir, {
  source: "doctor-install",
  installed: result.installed,
  currentVersion: result.currentVersion,
  installedVersion: result.installedVersion,
  configFile: result.configFile,
  manifestFile: result.manifestFile,
  pluginRuntimeImportOk: result.pluginRuntimeImportOk,
  pluginRuntimeImportError: result.pluginRuntimeImportError,
  wireMcpConfigured: result.wireMcpConfigured,
  openCode: result.openCode,
  nodeModules: result.nodeModules,
  pluginBundle: result.pluginBundle,
  upgradeAvailable: result.upgradeAvailable,
  configError: result.configError,
})
const unhealthy =
  !result.installed ||
  result.configError ||
  !result.openCode ||
  !result.nodeModules ||
  !result.pluginBundle ||
  !result.pluginRuntimeImportOk ||
  result.upgradeAvailable
if (json) console.log(JSON.stringify(result, null, 2))
else {
  console.log("# OpenCode for CTF doctor")
  console.log(`installation: ${installed ? "found" : "missing - run npm run ctf:install"}`)
  console.log(`opencode: ${result.openCode ? "found" : "missing"}`)
  console.log(`config: ${configError ? `invalid - ${configError}` : "valid"}`)
  console.log(`plugin_bundle: ${result.pluginBundle ? "ready" : "missing - run npm run build:plugin"}`)
  console.log(
    `plugin_runtime_import: ${
      result.pluginRuntimeImportOk ? "ok" : `failed - ${result.pluginRuntimeImportError ?? "unknown error"}`
    }`,
  )
  console.log(`health_file: ${result.healthFile}`)
  console.log(`version: ${installedVersion ?? "not installed"} (project ${currentVersion})`)
  for (const group of TOOL_CHECK_GROUPS) {
    const bucket = groups.get(group) ?? { found: [], missing: [] }
    console.log(`\n## ${group}`)
    console.log(`found: ${bucket.found.length ? bucket.found.join(", ") : "none"}`)
    console.log(`missing: ${bucket.missing.length ? bucket.missing.join(", ") : "none"}`)
  }
  console.log("\nOptional tools are only required for challenge paths that use them.")
  console.log(`WireMCP backend: ${wireMcp.label}`)
}
if (strict && unhealthy) process.exitCode = 1
