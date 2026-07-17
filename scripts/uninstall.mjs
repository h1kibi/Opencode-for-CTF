import { existsSync } from "node:fs"
import { readFile, rm } from "node:fs/promises"
import {
  configPath,
  manifestPath,
  opencodeConfigDir,
  removeManagedFiles,
  revertConfigOperations,
} from "./lib/opencode-ctf-install.mjs"

const configDir = opencodeConfigDir()
const manifestFile = manifestPath(configDir)
if (!existsSync(manifestFile)) {
  console.log("OpenCode for CTF is not installed: manifest is missing.")
  process.exit(0)
}

const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
const fileResult = await removeManagedFiles(configDir, manifest)
const configResult = await revertConfigOperations(
  manifest.config ?? configPath(configDir),
  manifest.configOperations ?? [],
)
await rm(manifestFile, { force: true })
console.log("Removed OpenCode for CTF managed resources.")
console.log(`files removed: ${fileResult.removed}`)
console.log(`modified files preserved: ${fileResult.preserved}`)
console.log(`config entries reverted: ${configResult.reverted}`)
console.log(`modified config entries preserved: ${configResult.preserved}`)
