import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { applyEdits, modify, parse } from "jsonc-parser"
import { isKnowledgeInstallIncluded } from "./publish-assets.mjs"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const ignoredCopyDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "state"])
const jsonFormatting = { insertSpaces: true, tabSize: 2, eol: "\n" }
const profiles = new Set(["safe", "web", "full"])

const SAFE_BASH_RULES = {
  "*": "ask",
  "file *": "allow",
  "strings *": "allow",
  "xxd *": "allow",
  "readelf *": "allow",
  "objdump *": "allow",
  "checksec *": "allow",
  "docker ps*": "allow",
  "docker logs*": "allow",
  "python *": "ask",
  "python3 *": "ask",
  "node *": "ask",
  "rm -rf *": "deny",
  "ssh *": "deny",
  "scp *": "deny",
  "rm *": "deny",
  "del *": "deny",
  "rmdir *": "deny",
  "Remove-Item *": "deny",
  "powershell Remove-Item *": "deny",
  "pwsh Remove-Item *": "deny",
}

const PROFILE_MCP = {
  safe: [],
  web: ["browser", "markitdown", "context7"],
  // Definitions with repository- or machine-specific absolute paths are never copied.
  full: ["browser", "markitdown", "context7", "github", "ReVa", "wireshark-mcp", "cyberchef-mcp", "ctfd-mcp", "seckb", "cvekb"],
}

const MCP_DEFAULTS = {
  browser: {
    type: "local",
    command: ["npx", "-y", "@playwright/mcp@latest"],
  },
  markitdown: {
    type: "local",
    command: ["npx", "-y", "mcp-markdownify-server"],
  },
  context7: {
    type: "remote",
    url: "https://mcp.context7.com/mcp",
  },
  github: {
    type: "remote",
    url: "https://api.githubcopilot.com/mcp/",
    headers: {
      Authorization: "Bearer {env:GITHUB_PAT}",
      "X-MCP-Readonly": "true",
    },
  },
  ReVa: {
    type: "local",
    command: ["mcp-reva"],
    timeout: 120000,
  },
  "wireshark-mcp": {
    type: "local",
    command: ["python", "{env:WIREMCP_LAUNCHER}", "--stdio"],
  },
  "cyberchef-mcp": {
    type: "local",
    command: ["npx", "-y", "cyberchef-mcp"],
  },
  "ctfd-mcp": {
    type: "local",
    command: ["npx", "-y", "ctfd-mcp"],
  },
  seckb: {
    type: "local",
    command: ["{env:SECKB_PYTHON}", "{env:SECKB_MCP_SERVER}"],
    environment: {
      SECKB_ROOT: "{env:SECKB_ROOT}",
      SECKB_CONFIG: "{env:SECKB_CONFIG}",
    },
  },
  cvekb: {
    type: "local",
    command: ["{env:SECKB_PYTHON}", "{env:CVEKB_MCP_SERVER}"],
    environment: { CVEKB_ROOT: "{env:CVEKB_ROOT}" },
  },
}

function managedAssetMappings() {
  const mappings = [
    { source: "agents", target: "agents" },
    { source: "commands", target: "commands" },
    { source: "skills", target: path.join("opencode-for-ctf", "skills") },
    { source: "rules", target: path.join("opencode-for-ctf", "rules") },
    { source: "templates", target: path.join("opencode-for-ctf", "templates") },
    { source: "knowledge", target: path.join("opencode-for-ctf", "knowledge") },
    { source: "lessons", target: path.join("opencode-for-ctf", "lessons") },
    { source: "runtime", target: path.join("opencode-for-ctf", "runtime") },
    { source: path.join("dist", "plugin"), target: path.join("opencode-for-ctf", "plugin") },
  ]
  if (process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === "1") {
    mappings.push({
      source: path.join("skills-external", "ctf-skills"),
      target: path.join("opencode-for-ctf", "skills-external", "ctf-skills"),
    })
  }
  return mappings
}

export async function projectVersion() {
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")).version
}

export async function ensurePluginBuild({ force = false } = {}) {
  const bundled = path.join(repoRoot, "dist", "plugin", "index.js")
  if (!force && existsSync(bundled)) return bundled
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-plugin.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  })
  if (result.status !== 0 || !existsSync(bundled)) {
    throw new Error("Failed to build the bundled OpenCode for CTF plugin.")
  }
  return bundled
}

export function opencodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR)
  return path.join(os.homedir(), ".config", "opencode")
}

export function manifestPath(configDir = opencodeConfigDir()) {
  return path.join(configDir, "opencode-for-ctf.manifest.json")
}

export function configPath(configDir = opencodeConfigDir()) {
  const jsonc = path.join(configDir, "opencode.jsonc")
  const json = path.join(configDir, "opencode.json")
  if (existsSync(jsonc)) return jsonc
  if (existsSync(json)) return json
  return jsonc
}

export function installedPluginFile(configDir) {
  return path.join(configDir, "opencode-for-ctf", "plugin", "index.js")
}

export function installedSkillDirs(configDir) {
  const dirs = [path.join(configDir, "opencode-for-ctf", "skills")]
  const external = path.join(configDir, "opencode-for-ctf", "skills-external", "ctf-skills")
  if (existsSync(external)) dirs.push(external)
  return dirs
}

export function profileFromArgs(args, fallback = "safe") {
  const inline = args.find((arg) => arg.startsWith("--profile="))?.slice("--profile=".length)
  const index = args.indexOf("--profile")
  const following = index >= 0 ? args[index + 1] : undefined
  const profile = inline ?? (following && !following.startsWith("--") ? following : fallback)
  if (!profiles.has(profile)) throw new Error(`Unknown profile: ${profile}. Expected safe, web, or full.`)
  return profile
}

export function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  return result.status === 0
}

export async function readJsonc(file) {
  if (!existsSync(file)) return {}
  const raw = await readFile(file, "utf8")
  const errors = []
  const value = parse(raw, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length) {
    throw new Error(`Invalid JSONC in ${file} (parse error ${errors[0].error} at offset ${errors[0].offset})`)
  }
  return value ?? {}
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function hasOwnAtPath(value, parts) {
  let current = value
  for (const part of parts) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, part)) return false
    current = current[part]
  }
  return true
}

function getAtPath(value, parts) {
  return parts.reduce((current, part) => current?.[part], value)
}

async function updateJsonc(file, operations) {
  let text = existsSync(file) ? await readFile(file, "utf8") : "{}\n"
  for (const operation of operations) {
    text = applyEdits(text, modify(text, operation.path, operation.value, { formattingOptions: jsonFormatting }))
  }
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, text.endsWith("\n") ? text : `${text}\n`, "utf8")
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

function disabledMcp(value) {
  const cloned = structuredClone(value)
  delete cloned.environment?.GHIDRA_INSTALL_DIR
  if (cloned.environment && Object.keys(cloned.environment).length === 0) delete cloned.environment
  cloned.enabled = false
  return cloned
}

export async function buildConfigOperations(config, profile, configDir, previousOperations = []) {
  if (!profiles.has(profile)) throw new Error(`Unknown profile: ${profile}. Expected safe, web, or full.`)
  const operations = []
  const previousByPath = new Map(previousOperations.map((operation) => [JSON.stringify(operation.path), operation]))

  function addIfMissing(parts, value) {
    const current = getAtPath(config, parts)
    const previous = previousByPath.get(JSON.stringify(parts))
    if (!hasOwnAtPath(config, parts) && previous) return
    if (hasOwnAtPath(config, parts)) {
      if (!previous || !sameValue(current, previous.value) || sameValue(current, value)) return
      operations.push({
        path: parts,
        value,
        previousExists: previous.previousExists,
        previousValue: previous.previousValue,
        parentExisted: previous.parentExisted,
      })
      return
    }
    operations.push({
      path: parts,
      value,
      previousExists: false,
      parentExisted: parts.length < 2 || hasOwnAtPath(config, parts.slice(0, -1)),
    })
  }

  function addManagedArray(parts, managedValues) {
    const previous = previousByPath.get(JSON.stringify(parts))
    const currentValue = getAtPath(config, parts)
    const current = Array.isArray(currentValue) ? currentValue : []
    if (previous && !sameValue(currentValue, previous.value)) return
    const next = [...current]
    for (const value of managedValues) {
      if (!next.some((entry) => sameValue(entry, value))) next.push(value)
    }
    if (sameValue(current, next)) return
    operations.push({
      path: parts,
      value: next,
      previousExists: previous?.previousExists ?? hasOwnAtPath(config, parts),
      previousValue: previous?.previousValue ?? currentValue,
      parentExisted: previous?.parentExisted ?? (parts.length < 2 || hasOwnAtPath(config, parts.slice(0, -1))),
    })
  }

  addIfMissing(["$schema"], "https://opencode.ai/config.json")
  addIfMissing(["share"], "disabled")
  addIfMissing(["tool_output"], { max_lines: 500, max_bytes: 30000 })
  addIfMissing(["compaction"], { auto: true, prune: false, tail_turns: 40, reserved: 12000 })
  addIfMissing(["permission", "bash"], SAFE_BASH_RULES)

  for (const name of PROFILE_MCP[profile]) {
    const value = MCP_DEFAULTS[name]
    if (value) addIfMissing(["mcp", name], disabledMcp(value))
  }

  const pluginSpec = pathToFileURL(installedPluginFile(configDir)).href
  addManagedArray(["plugin"], [pluginSpec])
  addManagedArray(["skills", "paths"], installedSkillDirs(configDir))
  addIfMissing(["default_agent"], "ctf-fast")

  const managedInstructions = [
    path.join(configDir, "opencode-for-ctf", "rules", "zh-rules.md"),
    path.join(configDir, "opencode-for-ctf", "rules", "en-solve-rules.md"),
  ].filter((file) => existsSync(path.join(repoRoot, "rules", path.basename(file))))
  addManagedArray(["instructions"], managedInstructions)

  return operations
}

export async function applyConfigOperations(file, operations) {
  await updateJsonc(file, operations)
}

export async function revertConfigOperations(file, operations) {
  if (!existsSync(file)) return { reverted: 0, preserved: operations.length }
  const config = await readJsonc(file)
  const reversals = []
  let preserved = 0
  for (const operation of [...operations].reverse()) {
    if (!sameValue(getAtPath(config, operation.path), operation.value)) {
      preserved++
      continue
    }
    reversals.push({ path: operation.path, value: operation.previousExists ? operation.previousValue : undefined })
  }
  await updateJsonc(file, reversals)

  const revertedConfig = await readJsonc(file)
  const parents = new Map()
  for (const operation of operations) {
    if (operation.parentExisted !== false || operation.path.length < 2) continue
    const parent = operation.path.slice(0, -1)
    parents.set(JSON.stringify(parent), parent)
  }
  const cleanups = [...parents.values()]
    .sort((left, right) => right.length - left.length)
    .filter((parent) => {
      const value = getAtPath(revertedConfig, parent)
      return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0
    })
    .map((parent) => ({ path: parent, value: undefined }))
  await updateJsonc(file, cleanups)
  return { reverted: reversals.length, preserved }
}

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function backupFile(file) {
  if (!existsSync(file)) return undefined
  const backup = `${file}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`
  await copyFile(file, backup)
  return backup
}

async function listFiles(root, prefix = "") {
  const stat = await lstat(root)
  if (stat.isFile()) return [prefix]
  if (!stat.isDirectory()) return []
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredCopyDirs.has(entry.name)) continue
    const nextPrefix = prefix ? path.join(prefix, entry.name) : entry.name
    files.push(...(await listFiles(path.join(root, entry.name), nextPrefix)))
  }
  return files
}

async function safeManagedTarget(configDir, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative))
    throw new Error(`Refusing invalid managed path: ${relative}`)
  const root = path.resolve(configDir)
  const target = path.resolve(configDir, relative)
  const relativeToRoot = path.relative(root, target)
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Refusing managed path outside OpenCode config directory: ${relative}`)
  }
  let current = target
  while (true) {
    if (existsSync(current) && (await lstat(current)).isSymbolicLink()) {
      throw new Error(`Refusing managed path through symlink or junction: ${relative}`)
    }
    if (current === root) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return target
}

export async function managedFileHash(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex")
}

function shouldCopyManagedRelative(mappingSource, rel) {
  // Slim knowledge: skip intermediate pattern-card history and generator scripts.
  // Source checkouts may still contain v2–v8 for rebuild; install must not re-bloat.
  if (mappingSource === "knowledge" || mappingSource.replace(/\\/g, "/") === "knowledge") {
    return isKnowledgeInstallIncluded(rel)
  }
  return true
}

export async function writePluginRuntimeMetadata(configDir = opencodeConfigDir()) {
  const pluginRoot = path.join(configDir, "opencode-for-ctf")
  const pluginPackageJson = path.join(pluginRoot, "package.json")
  const metadata = {
    name: "opencode-for-ctf-runtime",
    private: true,
    type: "module",
    main: "./plugin/index.js",
    opencode: {
      type: "plugin-runtime-bundle",
      note: "Managed installed runtime bundle. Host should load plugin/index.js directly without resolving source-checkout dependencies.",
    },
  }
  await writeJsonAtomic(pluginPackageJson, metadata)
  return pluginPackageJson
}

export async function copyManagedFiles(configDir = opencodeConfigDir()) {
  await mkdir(configDir, { recursive: true })
  const copied = []
  const backups = []
  try {
    for (const mapping of managedAssetMappings()) {
      const source = path.join(repoRoot, mapping.source)
      if (!existsSync(source)) continue
      for (const rel of await listFiles(source)) {
        if (!shouldCopyManagedRelative(mapping.source, rel)) continue
        const from = rel ? path.join(source, rel) : source
        const targetRel = rel ? path.join(mapping.target, rel) : mapping.target
        const to = await safeManagedTarget(configDir, targetRel)
        await mkdir(path.dirname(to), { recursive: true })
        const backup = await backupFile(to)
        if (backup) backups.push({ file: to, backup })
        const entry = { path: targetRel }
        copied.push(entry)
        await copyFile(from, to)
        entry.sha256 = await managedFileHash(to)
      }
    }
    const pluginPackageJson = await writePluginRuntimeMetadata(configDir)
    copied.push({
      path: path.relative(configDir, pluginPackageJson),
      sha256: await managedFileHash(pluginPackageJson),
    })
  } catch (error) {
    await removeManagedFiles(configDir, { copied, backups })
    throw error
  }
  return { copied, backups }
}

export async function upgradeManagedFiles(configDir, previousManifest) {
  await mkdir(configDir, { recursive: true })
  const previousEntries = new Map(
    (previousManifest?.copied ?? []).map((entry) => [
      typeof entry === "string" ? entry : entry.path,
      typeof entry === "string" ? { path: entry } : entry,
    ]),
  )
  const backups = [...(previousManifest?.backups ?? [])]
  const copied = []
  const preserved = []
  const rollback = []
  const consumedBackups = new Set()
  const persistentBackups = new Set()
  const sourceTargets = new Set()

  try {
    for (const mapping of managedAssetMappings()) {
      const source = path.join(repoRoot, mapping.source)
      if (!existsSync(source)) continue
      for (const rel of await listFiles(source)) {
        if (!shouldCopyManagedRelative(mapping.source, rel)) continue
        const from = rel ? path.join(source, rel) : source
        const targetRel = rel ? path.join(mapping.target, rel) : mapping.target
        sourceTargets.add(targetRel)
        const to = await safeManagedTarget(configDir, targetRel)
        const previous = previousEntries.get(targetRel)
        if (previous && !previous.sha256) {
          copied.push(previous)
          preserved.push(targetRel)
          continue
        }
        if (previous?.sha256 && existsSync(to) && (await managedFileHash(to)) !== previous.sha256) {
          copied.push(previous)
          preserved.push(targetRel)
          continue
        }
        const existed = existsSync(to)
        const snapshot = existed ? await backupFile(to) : undefined
        rollback.push({ target: to, existed, snapshot })
        if (existed && !previous) {
          backups.push({ file: to, backup: snapshot })
          if (snapshot) persistentBackups.add(path.resolve(snapshot))
        }
        await mkdir(path.dirname(to), { recursive: true })
        await copyFile(from, to)
        copied.push({ path: targetRel, sha256: await managedFileHash(to) })
      }
    }

    for (const [targetRel, previous] of previousEntries) {
      if (sourceTargets.has(targetRel)) continue
      const to = await safeManagedTarget(configDir, targetRel)
      const backup = backups.find((entry) => path.resolve(entry.file) === path.resolve(to))
      if (!existsSync(to) || !previous.sha256 || (await managedFileHash(to)) !== previous.sha256) {
        preserved.push(targetRel)
        if (backup?.backup) consumedBackups.add(path.resolve(backup.backup))
        continue
      }
      const snapshot = await backupFile(to)
      rollback.push({ target: to, existed: true, snapshot })
      await rm(to, { force: true })
      if (backup?.backup && existsSync(backup.backup)) {
        await copyFile(backup.backup, to)
        consumedBackups.add(path.resolve(backup.backup))
      }
    }
  } catch (error) {
    for (const entry of rollback.reverse()) {
      await rm(entry.target, { force: true })
      if (entry.existed && entry.snapshot && existsSync(entry.snapshot)) await copyFile(entry.snapshot, entry.target)
      if (entry.snapshot) await rm(entry.snapshot, { force: true })
    }
    throw error
  }

  return {
    copied,
    backups: backups.filter((entry) => !consumedBackups.has(path.resolve(entry.backup))),
    preserved,
    async commit() {
      for (const entry of rollback) {
        if (entry.snapshot && !persistentBackups.has(path.resolve(entry.snapshot)))
          await rm(entry.snapshot, { force: true })
      }
      for (const backup of consumedBackups) await rm(backup, { force: true })
    },
    async rollback() {
      for (const entry of rollback.reverse()) {
        await rm(entry.target, { force: true })
        if (entry.existed && entry.snapshot && existsSync(entry.snapshot)) await copyFile(entry.snapshot, entry.target)
        if (entry.snapshot) await rm(entry.snapshot, { force: true })
      }
    },
  }
}

export async function removeManagedFiles(configDir = opencodeConfigDir(), manifest) {
  let removed = 0
  let preserved = 0
  const backups = new Map((manifest?.backups ?? []).map((entry) => [path.resolve(entry.file), entry.backup]))
  for (const entry of manifest?.copied ?? []) {
    const relative = typeof entry === "string" ? entry : entry.path
    const target = await safeManagedTarget(configDir, relative)
    const backup = backups.get(path.resolve(target))
    if (!existsSync(target)) {
      if (backup && existsSync(backup)) {
        await copyFile(await safeManagedTarget(configDir, path.relative(configDir, backup)), target)
        await rm(backup, { force: true })
        removed++
      }
      continue
    }
    if (typeof entry !== "string" && entry.sha256 && (await managedFileHash(target)) !== entry.sha256) {
      preserved++
      continue
    }
    await rm(target, { force: true })
    if (backup && existsSync(backup)) {
      await copyFile(await safeManagedTarget(configDir, path.relative(configDir, backup)), target)
      await rm(backup, { force: true })
    }
    removed++
  }
  return { removed, preserved }
}
