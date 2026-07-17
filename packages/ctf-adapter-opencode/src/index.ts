/**
 * OpenCode adapter surface for opencode-for-ctf.
 *
 * Keep harness-specific names and docs here. Pure scoring / routing stays in ctf-core.
 * Runtime hooks remain in repo-root `src/` so the published plugin entry stays stable.
 */

import {
  COMMAND_SURFACE,
  decideRoute,
  formatRouteDecision,
  scoreCategories,
  type CategoryScore,
  type RouteDecision,
  type RouteInput,
  type SolveMode,
  type ToolPack,
} from "../../ctf-core/src/index.ts"

export {
  COMMAND_SURFACE,
  decideRoute,
  formatRouteDecision,
  scoreCategories,
  type CategoryScore,
  type RouteDecision,
  type RouteInput,
  type SolveMode,
  type ToolPack,
}

/** Config filenames searched by the plugin (closest wins). */
export const OPENCODE_CTF_CONFIG_NAMES = ["opencode-for-ctf.jsonc", "opencode-for-ctf.json"] as const

/** Primary agents exposed as the product surface. */
export const PRIMARY_AGENTS = ["ctf-fast", "ctf-expert"] as const

/** Historical names that must keep working but are not product modes. */
export const COMPAT_AGENTS = ["ctf-master"] as const

/** Default slash entry for new users. */
export const DEFAULT_ENTRY_COMMAND = "/ctf"

/** Map route mode → primary agent name for OpenCode session switches. */
export function agentForMode(mode: "fast" | "expert" | "resume"): "ctf-fast" | "ctf-expert" {
  return mode === "fast" ? "ctf-fast" : "ctf-expert"
}

/**
 * Whether plugin config default_mode should force intensity when user did not pass mode=.
 * auto → leave decideRoute free; fast|expert → force.
 */
export function effectiveSolveMode(
  requested: "auto" | "fast" | "expert" | undefined,
  configDefault: "auto" | "fast" | "expert" = "auto",
): "auto" | "fast" | "expert" {
  if (requested === "fast" || requested === "expert") return requested
  if (configDefault === "fast" || configDefault === "expert") return configDefault
  return "auto"
}

/** True when a command name is part of the L0 user surface. */
export function isL0Command(command: string): boolean {
  const normalized = command.startsWith("/") ? command : `/${command}`
  return COMMAND_SURFACE.L0.some((item) => item.command === normalized)
}
