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
  projectVersion,
  readJsonc,
  removeManagedFiles,
  revertConfigOperations,
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
} catch (error) {
  try {
    if (resources) await removeManagedFiles(configDir, resources)
    await revertConfigOperations(file, configOperations)
    await rm(manifestFile, { force: true })
    if (backup) await rm(backup, { force: true })
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], "Installation failed and rollback was incomplete.")
  }
  throw error
}

console.log(`OpenCode for CTF installed with the ${profile} profile.`)
console.log(`config: ${file}`)
if (backup) console.log(`backup: ${backup}`)
console.log(`copied: ${resources.copied.length} managed files`)
console.log(`config entries added: ${configOperations.length}`)
if (resources.backups.length) console.log(`file backups: ${resources.backups.length}`)
console.log("")
console.log("Next steps:")
console.log("  1. Restart OpenCode")
console.log("  2. Run:  /ctf ./challenge")
console.log("  3. Help: /help")
console.log("")
console.log("Optional: copy opencode-for-ctf.example.jsonc → opencode-for-ctf.jsonc to tune hooks/tool packs.")
