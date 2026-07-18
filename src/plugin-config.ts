import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse, type ParseError } from "jsonc-parser"

/** Known runtime hooks that users may disable via config. */
export type HookName =
  | "hashline"
  | "permission_auto_allow"
  | "chat_params"
  | "session_compacting"
  | "continuation"
  | "skill_mcp"
  | "team_events"

export type PluginUserConfig = {
  /** Default solve intensity for /ctf. */
  default_mode: "auto" | "fast" | "expert"
  /** Hooks to skip entirely. */
  disabled_hooks: HookName[]
  team_mode: {
    enabled: boolean
    max_workers: number
  }
  continuation: {
    enabled: boolean
  }
  ctf_fast_budget: {
    enabled: boolean
    soft_minutes: number
    escalate_on_expiry: boolean
  }
  /** When false, Read/Edit hash tags are not injected/verified. */
  hashline: {
    enabled: boolean
  }
  /**
   * Tool packs to register at plugin startup (process-level registry).
   * Default omits rare packs (android, godot). Use ["all"] for every tool.
   * This is the SUPERSET available to expert; ctf-fast is further restricted
   * by FAST_TOOL_ALLOWLIST at tool.execute time.
   */
  tool_packs?: string[]
  /**
   * Optional packs to ensure are present for expert-heavy work.
   * Merged into the startup registry when non-empty (still requires restart).
   * Prefer setting tool_packs=["all"] for true full environment.
   */
  expert_tool_packs?: string[]
  external_skills?: boolean
}

export const DEFAULT_PLUGIN_CONFIG: PluginUserConfig = {
  default_mode: "auto",
  disabled_hooks: [],
  team_mode: {
    enabled: true,
    max_workers: 8,
  },
  continuation: {
    enabled: true,
  },
  ctf_fast_budget: {
    enabled: true,
    soft_minutes: 15,
    escalate_on_expiry: true,
  },
  hashline: {
    enabled: true,
  },
  external_skills: false,
}

const CONFIG_BASENAMES = ["opencode-for-ctf.jsonc", "opencode-for-ctf.json"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asHookList(value: unknown): HookName[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<string>([
    "hashline",
    "permission_auto_allow",
    "chat_params",
    "session_compacting",
    "continuation",
    "skill_mcp",
    "team_events",
  ])
  return value.filter((item): item is HookName => typeof item === "string" && allowed.has(item))
}

/** Merge a partial config object onto defaults (shallow + known nested keys). */
export function mergePluginConfig(partial: unknown): PluginUserConfig {
  const base: PluginUserConfig = structuredClone(DEFAULT_PLUGIN_CONFIG)
  if (!isRecord(partial)) return base

  if (partial.default_mode === "auto" || partial.default_mode === "fast" || partial.default_mode === "expert") {
    base.default_mode = partial.default_mode
  }
  if (Array.isArray(partial.disabled_hooks)) {
    base.disabled_hooks = asHookList(partial.disabled_hooks)
  }
  if (isRecord(partial.team_mode)) {
    if (typeof partial.team_mode.enabled === "boolean") base.team_mode.enabled = partial.team_mode.enabled
    if (typeof partial.team_mode.max_workers === "number" && partial.team_mode.max_workers > 0) {
      base.team_mode.max_workers = Math.min(16, Math.floor(partial.team_mode.max_workers))
    }
  }
  if (isRecord(partial.continuation) && typeof partial.continuation.enabled === "boolean") {
    base.continuation.enabled = partial.continuation.enabled
  }
  if (isRecord(partial.ctf_fast_budget)) {
    if (typeof partial.ctf_fast_budget.enabled === "boolean") {
      base.ctf_fast_budget.enabled = partial.ctf_fast_budget.enabled
    }
    if (typeof partial.ctf_fast_budget.soft_minutes === "number" && partial.ctf_fast_budget.soft_minutes > 0) {
      base.ctf_fast_budget.soft_minutes = Math.min(120, Math.max(5, Math.floor(partial.ctf_fast_budget.soft_minutes)))
    }
    if (typeof partial.ctf_fast_budget.escalate_on_expiry === "boolean") {
      base.ctf_fast_budget.escalate_on_expiry = partial.ctf_fast_budget.escalate_on_expiry
    }
  }
  if (isRecord(partial.hashline) && typeof partial.hashline.enabled === "boolean") {
    base.hashline.enabled = partial.hashline.enabled
  }
  if (Array.isArray(partial.tool_packs)) {
    base.tool_packs = partial.tool_packs.filter((x): x is string => typeof x === "string")
  }
  if (Array.isArray(partial.expert_tool_packs)) {
    base.expert_tool_packs = partial.expert_tool_packs.filter((x): x is string => typeof x === "string")
  }
  if (typeof partial.external_skills === "boolean") {
    base.external_skills = partial.external_skills
  }

  // Convenience: hashline.enabled false also implies disabled_hooks contains hashline
  if (base.hashline.enabled === false && !base.disabled_hooks.includes("hashline")) {
    base.disabled_hooks = [...base.disabled_hooks, "hashline"]
  }
  if (base.continuation.enabled === false && !base.disabled_hooks.includes("continuation")) {
    base.disabled_hooks = [...base.disabled_hooks, "continuation"]
  }

  return base
}

export function isHookEnabled(config: PluginUserConfig, hook: HookName): boolean {
  return !config.disabled_hooks.includes(hook)
}

function configDirCandidates(startDir?: string): string[] {
  const dirs: string[] = []
  if (startDir) {
    let cur = path.resolve(startDir)
    const home = os.homedir()
    for (let i = 0; i < 8; i++) {
      dirs.push(cur)
      const parent = path.dirname(cur)
      if (parent === cur || cur === home) break
      cur = parent
    }
  }
  const xdg = process.env.XDG_CONFIG_HOME
  const opencodeDir = process.env.OPENCODE_CONFIG_DIR
  if (opencodeDir) dirs.push(opencodeDir)
  if (xdg) dirs.push(path.join(xdg, "opencode"))
  dirs.push(path.join(os.homedir(), ".config", "opencode"))
  return [...new Set(dirs)]
}

/**
 * Resolve config file paths, closest-wins: project walk first, then OpenCode config dir.
 * Returns paths in priority order (first existing file wins when loading).
 */
export function resolveConfigCandidates(startDir?: string): string[] {
  const out: string[] = []
  for (const dir of configDirCandidates(startDir)) {
    for (const name of CONFIG_BASENAMES) {
      out.push(path.join(dir, name))
    }
  }
  return out
}

export type LoadedPluginConfig = {
  config: PluginUserConfig
  /** Absolute path of the config file that was loaded, or null when defaults were used. */
  path: string | null
}

/**
 * Load the first existing opencode-for-ctf config plus its path.
 * Parse failures warn and continue to the next candidate; if none load, defaults are returned.
 */
export async function loadPluginConfigWithPath(startDir?: string): Promise<LoadedPluginConfig> {
  for (const file of resolveConfigCandidates(startDir)) {
    if (!existsSync(file)) continue
    try {
      const raw = await readFile(file, "utf8")
      const errors: ParseError[] = []
      const parsed = parse(raw, errors, { allowTrailingComma: true, disallowComments: false }) as unknown
      if (errors.length > 0) {
        throw new Error(
          errors
            .map((error) => `${file}:${error.offset} parse error ${error.error}`)
            .join("; "),
        )
      }
      return { config: mergePluginConfig(parsed), path: file }
    } catch (err) {
      console.warn(
        `[plugin] failed to parse config ${file}:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }
  return { config: structuredClone(DEFAULT_PLUGIN_CONFIG), path: null }
}

/** Load the first existing opencode-for-ctf config, or defaults. */
export async function loadPluginConfig(startDir?: string): Promise<PluginUserConfig> {
  return (await loadPluginConfigWithPath(startDir)).config
}
