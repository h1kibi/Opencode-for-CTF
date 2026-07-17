import { access, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { ToolDefinition } from "@opencode-ai/plugin"
import { PLUGIN_ROOT } from "./asset-paths.ts"
import {
  packForTool,
  resolveEnabledPacks,
  summarizePacks,
  toolAllowedByPacks,
  type ToolPackId,
} from "./tool-packs.ts"

type ToolModule = { default?: unknown }

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

async function resolveToolRoot(root?: string): Promise<string> {
  const bundledRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools")
  const sourceRoot = root ?? path.join(PLUGIN_ROOT, "tools")
  if (root) return sourceRoot
  return access(bundledRoot)
    .then(() => bundledRoot)
    .catch(() => sourceRoot)
}

/** List tool basenames available on disk (no import). */
export async function listToolNames(root?: string): Promise<string[]> {
  const toolRoot = await resolveToolRoot(root)
  const entries = await readdir(toolRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js")))
    .map((entry) => entry.name.replace(/\.(ts|js)$/, ""))
    .sort()
}

/**
 * Load CTF tools into a registry, optionally filtered by tool packs.
 * Default packs exclude rare specialists (android/godot) unless configured.
 */
export async function loadCtfTools(
  rootOrOptions?: string | LoadCtfToolsOptions,
): Promise<Record<string, ToolDefinition>> {
  const options: LoadCtfToolsOptions =
    typeof rootOrOptions === "string" || rootOrOptions === undefined
      ? { root: rootOrOptions }
      : rootOrOptions

  const toolRoot = await resolveToolRoot(options.root)
  const enabled = options.all
    ? null
    : options.packs
      ? resolveEnabledPacks([...options.packs])
      : resolveEnabledPacks()

  const tools: Record<string, ToolDefinition> = {}
  const entries = await readdir(toolRoot, { withFileTypes: true })
  let skippedPack = 0

  for (const entry of entries) {
    if (!entry.isFile() || !(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) continue
    const name = entry.name.replace(/\.(ts|js)$/, "")
    if (enabled && !toolAllowedByPacks(name, enabled)) {
      skippedPack++
      continue
    }
    try {
      const module = (await import(pathToFileURL(path.join(toolRoot, entry.name)).href)) as ToolModule
      if (isToolDefinition(module.default)) tools[name] = module.default
      else console.warn(`[plugin] skipped ${entry.name}: default export is not an OpenCode tool`)
    } catch (error) {
      console.warn(
        `[plugin] failed to load tool ${entry.name}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  if (enabled) {
    const packs = [...enabled].sort().join(",")
    console.log(
      `[plugin] tools: registered ${Object.keys(tools).length} (packs=${packs}` +
        (skippedPack ? `, deferred ${skippedPack} from other packs` : "") +
        ")",
    )
  }

  return tools
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
