import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import {
  applyConfigOperations,
  backupFile,
  buildConfigOperations,
  configPath,
  copyManagedFiles,
  ensurePluginBuild,
  manifestPath,
  opencodeConfigDir,
  profileFromArgs,
  probeInstalledPluginRuntime,
  projectVersion,
  readJsonc,
  removeManagedFiles,
  revertConfigOperations,
  tryWritePluginHealthReport,
  writeJsonAtomic,
} from "./lib/opencode-ctf-install.mjs"

const profile = profileFromArgs(process.argv.slice(2))
const configDir = opencodeConfigDir()
const manifestFile = manifestPath(configDir)
const file = configPath(configDir)
if (existsSync(manifestFile)) throw new Error("OpenCode for CTF is already installed. Run upgrade or uninstall first.")
// Prefer a fresh bundle on install so source checkouts pick up latest tools/hooks.
const forceBuild = process.env.OPENCODE_CTF_FORCE_BUILD !== "0"
await ensurePluginBuild({ force: forceBuild })

const config = await readJsonc(file)
const backup = await backupFile(file)
let resources
let configOperations = []
try {
  resources = await copyManagedFiles(configDir)
  configOperations = await buildConfigOperations(config, profile, configDir)
  await applyConfigOperations(file, configOperations)
  await writeJsonAtomic(manifestFile, {
    schemaVersion: 3,
    version: await projectVersion(),
    installedAt: new Date().toISOString(),
    profile,
    externalSkills: process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === "1",
    config: file,
    backup,
    ...resources,
    configOperations,
  })
  const runtimeProbe = await probeInstalledPluginRuntime(configDir)
  await tryWritePluginHealthReport(configDir, {
    source: "install",
    state: "installed",
    profile,
    config: file,
    manifest: manifestFile,
    pluginImportOk: runtimeProbe.ok,
    pluginImportError: runtimeProbe.ok ? null : runtimeProbe.error,
  })
} catch (error) {
  try {
    if (resources) await removeManagedFiles(configDir, resources)
    await revertConfigOperations(file, configOperations)
    await rm(manifestFile, { force: true })
    if (backup) await rm(backup, { force: true })
    await tryWritePluginHealthReport(configDir, {
      source: "install",
      state: "failed",
      profile,
      config: file,
      manifest: manifestFile,
      error: error instanceof Error ? error.message : String(error),
    })
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], "Installation failed and rollback was incomplete.")
  }
  throw error
}

console.log(`OpenCode for CTF installed with the ${profile} profile.`)
console.log(`config: ${file}`)
if (backup) console.log(`backup: ${backup}`)
const installedAgentDefinitions = resources.copied.filter((entry) => {
  const relative = typeof entry === "string" ? entry : entry.path
  return String(relative).replaceAll("\\", "/").startsWith("agents/") && String(relative).endsWith(".md")
}).length
const userSelectableAgents = ["ctf-fast", "ctf-expert"]

console.log(`copied: ${resources.copied.length} managed files`)
console.log(
  `CTF agent definitions: ${installedAgentDefinitions} (${userSelectableAgents.length} user-selectable CTF agents: ${userSelectableAgents.join(", ")}; ${Math.max(0, installedAgentDefinitions - userSelectableAgents.length)} hidden internal subagents for delegation)`,
)
console.log(`config entries added: ${configOperations.length}`)
if (resources.backups.length) console.log(`file backups: ${resources.backups.length}`)
console.log("")
console.log("Next steps:")
console.log("  1. Restart OpenCode")
console.log("  2. Run:  /ctf ./challenge")
console.log("  3. Help: /help")
console.log("")
console.log("Optional: copy opencode-for-ctf.example.jsonc → opencode-for-ctf.jsonc to tune hooks/tool packs.")
