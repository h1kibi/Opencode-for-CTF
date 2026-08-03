import { existsSync } from "node:fs"
import { copyFile, readFile, rm } from "node:fs/promises"
import {
  applyConfigOperations,
  backupFile,
  buildConfigOperations,
  configPath,
  ensurePluginBuild,
  manifestPath,
  opencodeConfigDir,
  profileFromArgs,
  probeInstalledPluginRuntime,
  projectVersion,
  readJsonc,
  revertConfigOperations,
  tryWritePluginHealthReport,
  upgradeManagedFiles,
  writeJsonAtomic,
} from "./lib/opencode-ctf-install.mjs"

const configDir = opencodeConfigDir()
const manifestFile = manifestPath(configDir)
if (!existsSync(manifestFile)) throw new Error("OpenCode for CTF is not installed. Run install first.")
const forceBuild = process.env.OPENCODE_CTF_FORCE_BUILD !== "0"
await ensurePluginBuild({ force: forceBuild })

const previousManifest = JSON.parse(await readFile(manifestFile, "utf8"))
if (previousManifest.externalSkills && process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === undefined) {
  process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS = "1"
}
const version = await projectVersion()
const profile = profileFromArgs(process.argv.slice(2), previousManifest.profile ?? "full")
const file = previousManifest.config ?? configPath(configDir)
const config = await readJsonc(file)
const configBackup = await backupFile(file)
let resources
let configOperations = []
try {
  resources = await upgradeManagedFiles(configDir, previousManifest)
  configOperations = await buildConfigOperations(config, profile, configDir, previousManifest.configOperations ?? [])
  await applyConfigOperations(file, configOperations)
  const mergedOperations = [...(previousManifest.configOperations ?? [])]
  for (const operation of configOperations) {
    const index = mergedOperations.findIndex((entry) => JSON.stringify(entry.path) === JSON.stringify(operation.path))
    if (operation.value === undefined && operation.previousExists === false) {
      if (index >= 0) mergedOperations.splice(index, 1)
    } else if (index >= 0) mergedOperations[index] = operation
    else mergedOperations.push(operation)
  }
  await writeJsonAtomic(manifestFile, {
    ...previousManifest,
    schemaVersion: 3,
    version,
    previousVersion: previousManifest.version ?? "unknown",
    upgradedAt: new Date().toISOString(),
    profile,
    externalSkills: process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === "1",
    config: file,
    copied: resources.copied,
    backups: resources.backups,
    preserved: resources.preserved,
    configOperations: mergedOperations,
  })
  await resources.commit()
  if (configBackup) await rm(configBackup, { force: true })
  const runtimeProbe = await probeInstalledPluginRuntime(configDir)
  await tryWritePluginHealthReport(configDir, {
    source: "upgrade",
    state: "upgraded",
    profile,
    config: file,
    manifest: manifestFile,
    previousVersion: previousManifest.version ?? "unknown",
    currentVersion: version,
    pluginImportOk: runtimeProbe.ok,
    pluginImportError: runtimeProbe.ok ? null : runtimeProbe.error,
  })
} catch (error) {
  try {
    if (resources?.rollback) await resources.rollback()
    if (configBackup) {
      await copyFile(configBackup, file)
      await rm(configBackup, { force: true })
    } else {
      await revertConfigOperations(file, configOperations)
    }
    await writeJsonAtomic(manifestFile, previousManifest)
    await tryWritePluginHealthReport(configDir, {
      source: "upgrade",
      state: "failed",
      profile,
      config: file,
      manifest: manifestFile,
      error: error instanceof Error ? error.message : String(error),
      previousVersion: previousManifest.version ?? "unknown",
      currentVersion: version,
    })
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], "Upgrade failed and rollback was incomplete.")
  }
  throw error
}

console.log(`OpenCode for CTF upgraded from ${previousManifest.version ?? "unknown"} to ${version}.`)
console.log(`profile: ${profile}`)
console.log(`updated: ${resources.copied.length} managed files`)
console.log(`preserved: ${resources.preserved.length} user-modified files`)
console.log(`config entries updated: ${configOperations.length}`)
