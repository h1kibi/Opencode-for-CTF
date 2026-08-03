import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { ToolDefinition } from "@opencode-ai/plugin"
import { PLUGIN_ROOT } from "./asset-paths.ts"
import { packForTool, resolveEnabledPacks, summarizePacks, toolAllowedByPacks, type ToolPackId } from "./tool-packs.ts"
import { toolRequires } from "./tool-metadata.ts"

type ToolModule = { default?: unknown }
type ToolFile = { name: string; path: string; relative: string }
export type LoadCtfToolsOptions = {
  /** Explicit tool directory (tests). */
  root?: string
  /**
   * Pack ids to register. When omitted, uses config/env defaults via resolveEnabledPacks.
   * Pass ["all"] equivalent by using resolveEnabledPacks(["all"]).
   */
  packs?: Iterable<string> | Set<string>
  /** When true, ignore pack filters and load every tool (legacy / tests). */
  all?: boolean
}
function isToolDefinition(value: unknown): value is ToolDefinition {
  return typeof value === "object" && value !== null && typeof (value as { execute?: unknown }).execute === "function"
}

/**
 * Locate the bundled tools/ directory for a given module location.
 *
 * Bundled installs ship tools/ next to plugin/index.js, but esbuild
 * `splitting` moves shared modules into plugin/chunks/, so the module dir
 * alone is not a stable anchor. Returns the first existing candidate
 * (`<dir>/tools` then `<dir>/../tools`), or "" when neither exists.
 */
export async function resolveBundledToolsDir(moduleDir: string): Promise<string> {
  const candidates = [path.join(moduleDir, "tools"), path.join(moduleDir, "..", "tools")]
  for (const candidate of candidates) {
    if (
      await access(candidate)
        .then(() => true)
        .catch(() => false)
    )
      return candidate
  }
  return ""
}

async function resolveToolRoot(root?: string): Promise<string> {
  if (root) return root
  const here = path.dirname(fileURLToPath(import.meta.url))
  const bundled = await resolveBundledToolsDir(here)
  if (bundled) return bundled
  // Source checkout (or an unusual layout): fall back to the repo tools/.
  const sourceRoot = path.join(PLUGIN_ROOT, "tools")
  if (
    await access(sourceRoot)
      .then(() => true)
      .catch(() => false)
  )
    return sourceRoot
  throw new Error(`CTF tools directory not found; tried: ${here}, ${PLUGIN_ROOT} (bundle layout may have changed)`)
}

async function discoverToolFiles(toolRoot: string): Promise<ToolFile[]> {
  const files: ToolFile[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "lib") continue
        await walk(path.join(dir, entry.name))
        continue
      }
      if (!entry.isFile() || !(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) continue
      if (entry.name.endsWith(".d.ts")) continue
      const filePath = path.join(dir, entry.name)
      files.push({
        name: entry.name.replace(/\.(ts|js)$/, ""),
        path: filePath,
        relative: path.relative(toolRoot, filePath),
      })
    }
  }

  await walk(toolRoot)
  files.sort((a, b) => a.name.localeCompare(b.name) || a.relative.localeCompare(b.relative))

  const seen = new Map<string, string>()
  for (const file of files) {
    const existing = seen.get(file.name)
    if (existing) {
      throw new Error(`duplicate CTF tool basename "${file.name}": ${existing} and ${file.relative}`)
    }
    seen.set(file.name, file.relative)
  }

  return files
}

/** List tool basenames available on disk (no import). */
export async function listToolNames(root?: string): Promise<string[]> {
  const toolRoot = await resolveToolRoot(root)
  return (await discoverToolFiles(toolRoot)).map((file) => file.name)
}

/**
 * Structured tool-load report — makes import failures, missing critical
 * tools, and external runtime dependencies visible at startup instead of a
 * silent green.
 */
export type ToolLoadFailure = {
  name: string
  path: string
  relative: string
  stage: "import" | "export-contract"
  error: string
  /** True when the tool is critical for the currently enabled packs. */
  critical: boolean
  /** Known alternate tool to try when this one fails (best effort). */
  fallback?: string
}

export type ToolLoadReport = {
  schemaVersion: 1
  generatedAt: string
  toolRoot: string
  enabledPacks: string[]
  registered: string[]
  /** Tools skipped because their pack is not enabled. */
  deferred: string[]
  failed: ToolLoadFailure[]
  /** Non-optional external dependencies declared by registered tools. */
  runtimeDependencies: string[]
  criticalRegistered: string[]
  criticalMissing: string[]
}

/** Known safe fallbacks for external-tool-heavy tools. */
const TOOL_FALLBACKS: Record<string, string> = {
  "ctf-pwn-docker-runner": "ctf-pwn-wsl-runner",
  "ctf-pwn-wsl-runner": "ctf-pwn-docker-runner",
  "ctf-pwn-runbox": "ctf-pwn-docker-runner",
}

let criticalToolCache: Set<string> | null = null

/** Critical tool names from ctf-agent.manifest.json (best effort). */
export async function criticalToolNames(): Promise<Set<string>> {
  if (criticalToolCache) return criticalToolCache
  const candidates = [
    path.join(PLUGIN_ROOT, "ctf-agent.manifest.json"),
    path.resolve(process.cwd(), "ctf-agent.manifest.json"),
  ]
  criticalToolCache = new Set()
  for (const manifestPath of candidates) {
    try {
      const raw = JSON.parse(await readFile(manifestPath, "utf8")) as { required_tools?: string[] }
      criticalToolCache = new Set(raw.required_tools ?? [])
      break
    } catch {
      // try next candidate
    }
  }
  return criticalToolCache
}

async function manifestCriticalsApplyToRoot(toolRoot: string, explicitRoot?: string): Promise<boolean> {
  if (!explicitRoot) return true
  const resolvedToolRoot = path.resolve(toolRoot)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const bundled = await resolveBundledToolsDir(here)
  const canonicalRoots = new Set([path.resolve(path.join(PLUGIN_ROOT, "tools"))])
  if (bundled) canonicalRoots.add(path.resolve(bundled))
  return [...canonicalRoots].some((candidate) => candidate === resolvedToolRoot)
}

/**
 * Load CTF tools into a registry (optionally filtered by packs) and produce
 * a structured ToolLoadReport. `loadCtfTools` delegates here and discards
 * the report for callers that only need the registry.
 */
export async function loadCtfToolsWithReport(
  rootOrOptions?: string | LoadCtfToolsOptions,
): Promise<{ tools: Record<string, ToolDefinition>; report: ToolLoadReport }> {
  const options: LoadCtfToolsOptions =
    typeof rootOrOptions === "string" || rootOrOptions === undefined ? { root: rootOrOptions } : rootOrOptions

  const toolRoot = await resolveToolRoot(options.root)
  const enabled = options.all ? null : options.packs ? resolveEnabledPacks([...options.packs]) : resolveEnabledPacks()

  const tools: Record<string, ToolDefinition> = {}
  const files = await discoverToolFiles(toolRoot)
  const discoveredNames = new Set(files.map((file) => file.name))
  const deferred: string[] = []
  const failed: ToolLoadFailure[] = []
  const critical = await criticalToolNames()
  const enforceManifestCriticals = await manifestCriticalsApplyToRoot(toolRoot, options.root)
  const criticalSurface = enforceManifestCriticals
    ? critical
    : new Set([...critical].filter((name) => discoveredNames.has(name)))
  const activeCritical = new Set([...criticalSurface].filter((name) => !enabled || toolAllowedByPacks(name, enabled)))

  for (const file of files) {
    const name = file.name
    if (enabled && !toolAllowedByPacks(name, enabled)) {
      deferred.push(name)
      continue
    }
    try {
      const module = (await import(pathToFileURL(file.path).href)) as ToolModule
      if (isToolDefinition(module.default)) {
        tools[name] = module.default
      } else {
        failed.push({
          name,
          path: file.path,
          relative: file.relative,
          stage: "export-contract",
          error: "default export is not an OpenCode tool definition",
          critical: activeCritical.has(name),
          fallback: TOOL_FALLBACKS[name],
        })
      }
    } catch (error) {
      failed.push({
        name,
        path: file.path,
        relative: file.relative,
        stage: "import",
        error: error instanceof Error ? error.message : String(error),
        critical: activeCritical.has(name),
        fallback: TOOL_FALLBACKS[name],
      })
    }
  }

  const registered = Object.keys(tools).sort()
  const runtimeDependencies = [
    ...new Set(registered.flatMap((name) => toolRequires(name)).filter((dep) => dep && !dep.endsWith("?"))),
  ].sort()
  const report: ToolLoadReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    toolRoot,
    enabledPacks: enabled ? [...enabled].sort() : ["all"],
    registered,
    deferred: deferred.sort(),
    failed,
    runtimeDependencies,
    criticalRegistered: registered.filter((name) => activeCritical.has(name)).sort(),
    criticalMissing: [...activeCritical].filter((name) => !tools[name]).sort(),
  }

  if (enabled) {
    const packs = [...enabled].sort().join(",")
    console.log(
      `[plugin] tools: registered ${registered.length} (packs=${packs}` +
        (deferred.length ? `, deferred ${deferred.length} from other packs` : "") +
        (failed.length ? `, failed ${failed.length}` : "") +
        ")",
    )
  }
  for (const failure of failed) {
    console.warn(
      `[plugin] tool load ${failure.stage} FAILED ${failure.relative}: ${failure.error}` +
        (failure.critical ? " [CRITICAL]" : "") +
        (failure.fallback ? ` fallback=${failure.fallback}` : ""),
    )
  }
  if (report.criticalMissing.length) {
    console.warn(`[plugin] critical tools missing after load: ${report.criticalMissing.join(", ")}`)
  }

  return { tools, report }
}

/**
 * Load CTF tools into a registry, optionally filtered by tool packs.
 * Default packs exclude rare specialists (android/godot) unless configured.
 * Use loadCtfToolsWithReport for structured failure visibility.
 */
export async function loadCtfTools(
  rootOrOptions?: string | LoadCtfToolsOptions,
): Promise<Record<string, ToolDefinition>> {
  return (await loadCtfToolsWithReport(rootOrOptions)).tools
}

/** Diagnostics helper used by ctf-tool-packs. */
export async function describeToolPacks(root?: string): Promise<{
  enabled: ToolPackId[]
  available: ReturnType<typeof summarizePacks>
  defaults: ToolPackId[]
}> {
  const names = await listToolNames(root)
  const enabled = [...resolveEnabledPacks()].sort() as ToolPackId[]
  return {
    enabled,
    available: summarizePacks(names),
    defaults: [...resolveEnabledPacks(undefined)].sort() as ToolPackId[],
  }
}

export { packForTool, resolveEnabledPacks, summarizePacks }
