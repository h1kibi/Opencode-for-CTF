import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { applyEdits, modify, parse } from "jsonc-parser"
import { isKnowledgeInstallIncluded } from "./publish-assets.mjs"
import {
  INSTALLER_PROFILES,
  JSON_FORMATTING,
  MCP_DEFAULTS,
  PROFILE_MCP,
  SAFE_BASH_RULES,
  managedAssetMappings,
} from "./install-defaults.mjs"

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const ignoredCopyDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "state"])
const jsonFormatting = JSON_FORMATTING
const profiles = INSTALLER_PROFILES

export async function projectVersion() {
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")).version
}

export async function ensurePluginBuild({ force = false } = {}) {
  const bundled = path.join(repoRoot, "dist", "plugin", "index.js")
  const hasSource = existsSync(path.join(repoRoot, "src", "plugin.ts")) && existsSync(path.join(repoRoot, "tools"))
  if (!force && existsSync(bundled)) return bundled
  if (!hasSource && existsSync(bundled)) return bundled
  if (!hasSource) throw new Error("Bundled OpenCode for CTF plugin is missing and source files are not available.")
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

export function pluginHealthPath(configDir = opencodeConfigDir()) {
  return path.join(configDir, "opencode-for-ctf.plugin-health.json")
}

export function configPath(configDir = opencodeConfigDir()) {
  const jsonc = path.join(configDir, "opencode.jsonc")
  const json = path.join(configDir, "opencode.json")
  if (existsSync(jsonc)) return jsonc
  if (existsSync(json)) return json
  return jsonc
}

function winTool(...segments) {
  if (process.platform !== "win32") return undefined
  return path.join("C:\\Tools", ...segments)
}

function localCommand(command, args = [], options = {}) {
  if (!command) return undefined
  return { command, args, ...options }
}

function localPath(command) {
  if (!command) return undefined
  return { command, args: [], pathOnly: true }
}

function pythonScript(script, args = []) {
  if (!script || !existsSync(script)) return undefined
  return { command: "python", args: [script, ...args] }
}

function localCommandFallbacks(command) {
  const candidates = {
    nuclei: [localPath(winTool("nuclei", "nuclei.exe"))],
    ffuf: [localCommand(winTool("ffuf", "ffuf.exe"), ["-V"])],
    feroxbuster: [localCommand(winTool("feroxbuster", "feroxbuster.exe"), ["--version"])],
    dirsearch: [pythonScript(winTool("dirsearch", "dirsearch.py"), ["--version"])],
    sqlmap: [pythonScript(winTool("sqlmap", "sqlmap.py"), ["--version"])],
    nmap: [localCommand(winTool("nmap", "nmap.exe"), ["--version"])],
    jadx: [localCommand(winTool("Jadx", "jadx.exe"), ["--version"])],
    r2: [
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"], { shell: true }),
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
    ],
    radare2: [
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "r2.bat"), ["-v"], { shell: true }),
      localCommand(winTool("radare2", "radare2-6.1.4-w64", "bin", "radare2.exe"), ["-v"]),
    ],
    exiftool: [localCommand(winTool("exiftool", "exiftool.exe"), ["-ver"])],
    hashcat: [localCommand(winTool("hashcat-7.1.2", "hashcat.exe"), ["--version"])],
  }
  return (candidates[command] ?? []).filter(Boolean)
}

function managedBuiltSourceOverride(sourceRoot, rel = "") {
  const root = String(sourceRoot).replace(/\\/g, "/")
  const child = String(rel).replace(/\\/g, "/")
  if (root === "mcp-server" && child === "vendor/WireMCP/index.js") {
    return path.join(repoRoot, "dist", "wiremcp", "index.js")
  }
  return null
}

export function installedPluginFile(configDir) {
  return path.join(configDir, "opencode-for-ctf", "plugin", "index.js")
}

export async function probeRuntimeModule(entryFile, options = {}) {
  const expectedExports = Array.isArray(options.expectedExports) ? options.expectedExports : []
  if (!existsSync(entryFile)) {
    return { ok: false, error: `missing file: ${entryFile}`, exportNames: [] }
  }

  try {
    const moduleUrl = pathToFileURL(entryFile)
    moduleUrl.searchParams.set("ctf_probe", `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const loaded = await import(moduleUrl.href)
    const exportNames = Object.keys(loaded).sort()
    const missingExports = expectedExports.filter((name) => !(name in loaded))
    if (missingExports.length) {
      return {
        ok: false,
        error: `loaded module but missing expected exports: ${missingExports.join(", ")}`,
        exportNames,
      }
    }
    return { ok: true, exportNames }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      exportNames: [],
    }
  }
}

export async function probeInstalledPluginRuntime(configDir = opencodeConfigDir()) {
  return probeRuntimeModule(installedPluginFile(configDir), {
    expectedExports: ["default", "server"],
  })
}

export function installedSkillDirs(configDir) {
  // External SecKnowledge is a reference corpus, not an active skill path.
  // Keeping it out of skills.paths prevents broad trigger/shadowing conflicts;
  // ctf-skill-repo-search loads it explicitly when evidence warrants recall.
  return [path.join(configDir, "opencode-for-ctf", "skills")]
}

export function profileFromArgs(args, fallback = "full") {
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
  if (result.status === 0) return true
  for (const candidate of localCommandFallbacks(command)) {
    if (candidate.pathOnly) {
      if (existsSync(candidate.command)) return true
      continue
    }
    const localResult = spawnSync(candidate.command, candidate.args, {
      stdio: "ignore",
      shell: candidate.shell ?? (process.platform === "win32" && /\.(bat|cmd)$/i.test(candidate.command)),
    })
    if (localResult.status === 0) return true
  }
  return false
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

export async function writePluginHealthReport(configDir = opencodeConfigDir(), report = {}) {
  const payload = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    ...report,
  }
  await writeJsonAtomic(pluginHealthPath(configDir), payload)
  return pluginHealthPath(configDir)
}

export async function tryWritePluginHealthReport(configDir = opencodeConfigDir(), report = {}) {
  try {
    return await writePluginHealthReport(configDir, report)
  } catch (error) {
    console.warn(
      `[plugin-health] failed to write ${pluginHealthPath(configDir)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return null
  }
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

function expandManagedRoot(value, configDir) {
  if (typeof value === "string") {
    return value.replaceAll("{managed_root}", path.join(configDir, "opencode-for-ctf").replace(/\\/g, "/"))
  }
  if (Array.isArray(value)) return value.map((entry) => expandManagedRoot(entry, configDir))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, expandManagedRoot(entry, configDir)]))
  }
  return value
}

function disabledMcp(value, configDir) {
  const cloned = structuredClone(value)
  const expanded = expandManagedRoot(cloned, configDir)
  delete expanded.environment?.GHIDRA_INSTALL_DIR
  if (expanded.environment && Object.keys(expanded.environment).length === 0) delete expanded.environment
  expanded.enabled = false
  return expanded
}

async function exportedPluginToolNames() {
  await ensurePluginBuild()
  const toolsDir = path.join(repoRoot, "dist", "plugin", "tools")
  const entries = await readdir(toolsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => entry.name.slice(0, -3))
    .filter(
      (name) =>
        name.startsWith("ctf-") ||
        name.startsWith("archive-") ||
        name.startsWith("seckb_") ||
        name.startsWith("cvekb_") ||
        name.startsWith("anysearch_"),
    )
    .sort()
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

  function removeManagedArrayValues(parts, managedValues) {
    const previous = previousByPath.get(JSON.stringify(parts))
    const currentValue = getAtPath(config, parts)
    if (previous && !sameValue(currentValue, previous.value)) return
    const current = Array.isArray(currentValue) ? currentValue : []
    const next = current.filter((entry) => !managedValues.some((value) => sameValue(entry, value)))
    if (sameValue(current, next) && !previous) return
    operations.push({
      path: parts,
      value: next.length ? next : undefined,
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
    if (value) addIfMissing(["mcp", name], disabledMcp(value, configDir))
  }

  const pluginSpec = pathToFileURL(installedPluginFile(configDir)).href
  addManagedArray(["plugin"], [pluginSpec])
  addManagedArray(["skills", "paths"], installedSkillDirs(configDir))
  addIfMissing(["default_agent"], "ctf-fast")

  const currentTools = getAtPath(config, ["tools"])
  const nextTools =
    currentTools && typeof currentTools === "object" && !Array.isArray(currentTools) ? { ...currentTools } : {}
  for (const name of await exportedPluginToolNames()) nextTools[name] = true
  if (!sameValue(currentTools, nextTools)) {
    operations.push({
      path: ["tools"],
      value: nextTools,
      previousExists: hasOwnAtPath(config, ["tools"]),
      previousValue: currentTools,
      parentExisted: true,
    })
  }

  const managedInstructions = [
    path.join(configDir, "opencode-for-ctf", "rules", "zh-rules.md"),
    path.join(configDir, "opencode-for-ctf", "rules", "en-solve-rules.md"),
    path.join(configDir, "opencode-for-ctf", "rules", "agent-equipment.md"),
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
  // Source checkouts may still contain v2-v8 for rebuild; install must not re-bloat.
  const source = mappingSource.replace(/\\/g, "/")
  const posixRel = rel.replace(/\\/g, "/")
  if (source === "knowledge") {
    return isKnowledgeInstallIncluded(rel)
  }
  if (source === "rag") {
    if (posixRel === "knowledge" || posixRel.startsWith("knowledge/")) {
      return isKnowledgeInstallIncluded(posixRel.slice("knowledge/".length))
    }
    if (posixRel === "lessons" || posixRel.startsWith("lessons/")) return true
    return false
  }
  return true
}

function isPluginBundleTarget(relative) {
  return relative.replace(/\\/g, "/").startsWith("opencode-for-ctf/plugin/")
}

async function copyManagedSourceFile(from, to) {
  try {
    await copyFile(from, to)
    return
  } catch (error) {
    const resolvedFrom = path.resolve(from)
    const rebuildableRoots = [path.join(repoRoot, "dist", "plugin"), path.join(repoRoot, "dist", "wiremcp")]
    if (
      error?.code !== "ENOENT" ||
      !rebuildableRoots.some((root) => resolvedFrom.startsWith(`${root}${path.sep}`) || resolvedFrom === root)
    ) {
      throw error
    }
  }

  await ensurePluginBuild({ force: true })
  await copyFile(from, to)
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
      note: "Managed installed runtime bundle. Host should load plugin/index.js directly without resolving source-checkout dependencies or external package installs.",
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
    const includeExternalSkills = process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === "1"
    for (const mapping of managedAssetMappings(includeExternalSkills)) {
      const source = path.join(repoRoot, mapping.source)
      if (!existsSync(source)) continue
      for (const rel of await listFiles(source)) {
        if (!shouldCopyManagedRelative(mapping.source, rel)) continue
        const override = managedBuiltSourceOverride(mapping.source, rel)
        const from = override ?? (rel ? path.join(source, rel) : source)
        const targetRel = rel ? path.join(mapping.target, rel) : mapping.target
        const to = await safeManagedTarget(configDir, targetRel)
        await mkdir(path.dirname(to), { recursive: true })
        const backup = await backupFile(to)
        if (backup) backups.push({ file: to, backup })
        const entry = { path: targetRel }
        copied.push(entry)
        await copyManagedSourceFile(from, to)
        entry.sha256 = await managedFileHash(to)
      }
    }
    const pluginPackageJson = await writePluginRuntimeMetadata(configDir)
    copied.push({
      path: path.relative(configDir, pluginPackageJson),
      sha256: await managedFileHash(pluginPackageJson),
    })
    const runtimeProbe = await probeInstalledPluginRuntime(configDir)
    if (!runtimeProbe.ok) {
      throw new Error(`Managed plugin runtime failed to import after install: ${runtimeProbe.error}`)
    }
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
    for (const mapping of managedAssetMappings(process.env.OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS === "1")) {
      const source = path.join(repoRoot, mapping.source)
      if (!existsSync(source)) continue
      for (const rel of await listFiles(source)) {
        if (!shouldCopyManagedRelative(mapping.source, rel)) continue
        const override = managedBuiltSourceOverride(mapping.source, rel)
        const from = override ?? (rel ? path.join(source, rel) : source)
        const targetRel = rel ? path.join(mapping.target, rel) : mapping.target
        sourceTargets.add(targetRel)
        const to = await safeManagedTarget(configDir, targetRel)
        const previous = previousEntries.get(targetRel)
        if (previous && !previous.sha256) {
          copied.push(previous)
          preserved.push(targetRel)
          continue
        }
        if (
          previous?.sha256 &&
          existsSync(to) &&
          (await managedFileHash(to)) !== previous.sha256 &&
          !isPluginBundleTarget(targetRel)
        ) {
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
        await copyManagedSourceFile(from, to)
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
