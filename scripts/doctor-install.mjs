import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  commandExists,
  configPath,
  manifestPath,
  opencodeConfigDir,
  projectVersion,
  readJsonc,
  repoRoot,
} from "./lib/opencode-ctf-install.mjs"

const json = process.argv.includes("--json")
const strict = process.argv.includes("--strict")
const checks = [
  ["core", "node", "node", ["--version"]],
  ["core", "npm", "npm", ["--version"]],
  ["core", "git", "git", ["--version"]],
  ["core", "python", "python", ["--version"]],
  ["web", "curl", "curl", ["--version"]],
  ["web", "docker", "docker", ["--version"]],
  ["web", "ffuf", "ffuf", ["-V"]],
  ["pwn", "gdb", "gdb", ["--version"]],
  ["pwn", "checksec", "checksec", ["--version"]],
  ["rev", "file", "file", ["--version"]],
  ["rev", "jadx", "jadx", ["--version"]],
  ["forensics", "tshark", "tshark", ["--version"]],
  ["forensics", "exiftool", "exiftool", ["-ver"]],
  ["crypto", "openssl", "openssl", ["version"]],
  ["crypto", "sage", "sage", ["--version"]],
]

const groups = new Map()
for (const [group, name, command, args] of checks) {
  const bucket = groups.get(group) ?? { found: [], missing: [] }
  ;(commandExists(command, args) ? bucket.found : bucket.missing).push(name)
  groups.set(group, bucket)
}

const configDir = opencodeConfigDir()
const configFile = configPath(configDir)
const manifestFile = manifestPath(configDir)
const installed = existsSync(manifestFile)
const currentVersion = await projectVersion()
let configError = null
let installedVersion = null
try {
  await readJsonc(configFile)
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

const result = {
  configDir,
  configFile,
  manifestFile,
  installed,
  openCode: commandExists("opencode", ["--version"]),
  nodeModules: existsSync(path.join(repoRoot, "node_modules")),
  pluginBundle: existsSync(path.join(repoRoot, "dist", "plugin", "index.js")),
  configError,
  currentVersion,
  installedVersion,
  upgradeAvailable: installed && installedVersion !== currentVersion,
  groups: Object.fromEntries(groups),
}
const unhealthy =
  !result.installed ||
  result.configError ||
  !result.openCode ||
  !result.nodeModules ||
  !result.pluginBundle ||
  result.upgradeAvailable
if (json) console.log(JSON.stringify(result, null, 2))
else {
  console.log("# OpenCode for CTF doctor")
  console.log(`installation: ${installed ? "found" : "missing - run npm run ctf:install"}`)
  console.log(`opencode: ${result.openCode ? "found" : "missing"}`)
  console.log(`config: ${configError ? `invalid - ${configError}` : "valid"}`)
  console.log(`plugin_bundle: ${result.pluginBundle ? "ready" : "missing - run npm run build:plugin"}`)
  console.log(`version: ${installedVersion ?? "not installed"} (project ${currentVersion})`)
  for (const group of ["core", "web", "pwn", "rev", "forensics", "crypto"]) {
    const bucket = groups.get(group) ?? { found: [], missing: [] }
    console.log(`\n## ${group}`)
    console.log(`found: ${bucket.found.length ? bucket.found.join(", ") : "none"}`)
    console.log(`missing: ${bucket.missing.length ? bucket.missing.join(", ") : "none"}`)
  }
  console.log("\nOptional tools are only required for challenge paths that use them.")
}
if (strict && unhealthy) process.exitCode = 1
