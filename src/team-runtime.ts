/**
 * Compatibility façade for Team Mode runtime APIs.
 *
 * The canonical Team Mode implementation now lives under `src/team/`.
 * This façade re-exports the stable public API so existing imports continue
 * to work while the run/job state machine evolves behind the subsystem.
 */

import type { ToolDefinition } from "@opencode-ai/plugin"
import { createTeamRuntimeCore } from "./team/team-runtime-core.ts"
import type { CreateTeamToolsOptions } from "./team/team-types.ts"

export type {
  CreateTeamToolsOptions,
  TeamAgent,
  TeamJob,
  TeamJobError,
  TeamJobErrorPhase,
  TeamJobErrorType,
  TeamJobStatus,
  TeamRouteId,
  TeamRun,
  TeamRunStatus,
  TeamState,
} from "./team/team-types.ts"
export {
  ABSOLUTE_MAX_JOBS,
  DEFAULT_MAX_JOBS,
  MAX_COLLECT_OUTPUT,
  MAX_JOB_RESULT,
  STATE_FILE,
  STATE_VERSION,
  TEAM_AGENT,
  TEAM_AGENTS,
  TEAM_ROUTE_IDS,
  now,
  resolveMaxJobs,
  safeError,
  slug,
} from "./team/team-types.ts"
export {
  findJobBySession,
  isOrphanedJob,
  findRun,
  isTerminalJob,
  readTeamState,
  updateTeamState,
  writeTeamState,
  quarantineTeamState,
  readRawTeamState,
} from "./team/team-state.ts"
export { renderRun, summarizeTeamState } from "./team/team-render.ts"

export function createTeamTools(
  client: any,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Record<string, ToolDefinition> {
  return createTeamRuntimeCore(client, directory, worktree, options).tools
}

export async function handleTeamEvent(
  event: { type: string; properties?: Record<string, any> },
  client: any,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Promise<void> {
  await createTeamRuntimeCore(client, directory, worktree, options).handleTeamEvent(event)
}

export async function initializeTeamRuntime(
  client: any,
  directory: string,
  worktree = directory,
  options: CreateTeamToolsOptions = {},
): Promise<void> {
  await createTeamRuntimeCore(client, directory, worktree, options).initialize()
}
