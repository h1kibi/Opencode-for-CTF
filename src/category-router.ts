/**
 * Runtime-facing category router.
 * Pure scoring lives in ctf-core; this module is the plugin-side import surface.
 */
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
} from "../packages/ctf-core/src/router.ts"
