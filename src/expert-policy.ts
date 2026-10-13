import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEvidenceDir, readCurrentEvidenceSlug } from "../scripts/evidence-helper.ts"
import { readTeamState } from "./team/team-state.ts"
import type { TeamRunStatus, TeamState } from "./team/team-types.ts"

export type ExpertPolicySnapshot = {
  evidenceInitialized: boolean
  routeIds: string[]
  activeRouteIds: string[]
  teamDispatched: boolean
  teamRunIds: string[]
  teamRunStatus?: TeamRunStatus
  teamStateReadable: boolean
  evidenceError?: string
  teamError?: string
}

type ToolArgs = Record<string, unknown>

const TEAM_CONTROL_TOOLS = new Set([
  "ctf-team-dispatch",
  "ctf-team-status",
  "ctf-team-collect",
  "ctf-team-cancel",
  "ctf-team-cancel-route",
  "ctf-team-close",
  "ctf-team-recover",
  "ctf-team-adopt",
  "ctf-team-facts",
  "ctf-team-intent",
  // Repair is the documented remedy for a stale/corrupt run, so it must be
  // reachable in exactly the states it exists to fix: before any wave, and
  // while a wave is stuck, degraded, or owned by a previous parent session.
  "ctf-team-repair",
])

/** Tools that are explicitly allowed before the first Team Mode wave. */
const PRE_TEAM_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "skill",
  "doc-read",
  "image-file-info",
  "ctf-env-check",
  "ctf-route-plan",
  "ctf-evidence-board",
  "ctf-decompose-task",
  "ctf-tool-packs",
  "ctf-runtime-selftest",
  "ctf-mcp-control",
  "ctf-dynamic-mcp-advisor",
  ...TEAM_CONTROL_TOOLS,
])

const ROUTE_EXCEPTIONS = new Set(["recon", "general"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function activeRouteIdsFromBoard(raw: unknown): { routeIds: string[]; activeRouteIds: string[] } {
  if (!isRecord(raw) || !Array.isArray(raw.routes)) return { routeIds: [], activeRouteIds: [] }
  const routes = raw.routes.filter(isRecord)
  const routeIds = routes.map((route) => safeString(route.id)).filter(Boolean)
  const activeRouteIds = routes
    .filter((route) => safeString(route.state) !== "dead")
    .map((route) => safeString(route.id))
    .filter(Boolean)
  return { routeIds, activeRouteIds }
}

async function readEvidenceSnapshot(directory: string) {
  const slug = readCurrentEvidenceSlug(directory)
  if (!slug) {
    return { initialized: false, routeIds: [], activeRouteIds: [] as string[] }
  }

  const boardPath = path.join(getEvidenceDir(directory, slug), ".ctf-evidence-board.json")
  try {
    const raw = JSON.parse(await readFile(boardPath, "utf8")) as unknown
    const routes = activeRouteIdsFromBoard(raw)
    return { initialized: true, ...routes }
  } catch (error) {
    return {
      initialized: false,
      routeIds: [],
      activeRouteIds: [],
      error: `Evidence board is unavailable at ${boardPath}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function teamRunsForSession(state: TeamState, sessionID: string) {
  return state.runs.filter((run) => run.parentSessionID === sessionID)
}

export async function loadExpertPolicySnapshot(directory: string, sessionID?: string): Promise<ExpertPolicySnapshot> {
  const evidence = await readEvidenceSnapshot(directory)
  let teamState: TeamState
  let teamError: string | undefined

  try {
    teamState = await readTeamState(directory)
  } catch (error) {
    teamState = { schemaVersion: 1, revision: 0, updatedAt: new Date(0).toISOString(), runs: [] }
    teamError = `Team state is unavailable: ${error instanceof Error ? error.message : String(error)}`
  }

  const ownedRuns = sessionID ? teamRunsForSession(teamState, sessionID) : []
  const latestRun = ownedRuns[ownedRuns.length - 1]
  const teamRunIds = ownedRuns.map((run) => run.id)
  return {
    evidenceInitialized: evidence.initialized,
    routeIds: evidence.routeIds,
    activeRouteIds: evidence.activeRouteIds,
    teamDispatched: teamRunIds.length > 0,
    teamRunIds,
    teamRunStatus: latestRun?.status,
    teamStateReadable: !teamError,
    evidenceError: evidence.error,
    teamError,
  }
}

export type ExpertPolicyDecision = {
  allowed: boolean
  reason?: string
}

function dispatchJobs(args: ToolArgs): Array<Record<string, unknown>> {
  return Array.isArray(args.jobs) ? args.jobs.filter(isRecord) : []
}

function hasExactlyThreeActiveRoutes(snapshot: ExpertPolicySnapshot): boolean {
  return (
    snapshot.routeIds.length === 3 &&
    snapshot.activeRouteIds.length === 3 &&
    new Set(snapshot.routeIds).size === 3 &&
    new Set(snapshot.activeRouteIds).size === 3
  )
}

/**
 * Pure Expert policy decision. This intentionally gates actions rather than
 * natural-language reasoning: the model may still think out of order, but it
 * cannot use active tools to bypass the Team Mode entry protocol.
 */
export function evaluateExpertToolPolicy(
  snapshot: ExpertPolicySnapshot,
  toolName: string,
  args: ToolArgs = {},
): ExpertPolicyDecision {
  if (typeof toolName !== "string" || !toolName.trim()) {
    return {
      allowed: false,
      reason: "ExpertPolicyError: tool identity is missing; refusing an unverified execution request.",
    }
  }

  if (toolName === "task" || toolName === "delegate") {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: ordinary ${toolName} is not allowed for ctf-expert. ` +
        `Use ctf-team-dispatch with at least two route-bound jobs instead.`,
    }
  }

  if (toolName === "ctf-team-dispatch") {
    if (!snapshot.evidenceInitialized) {
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: Evidence board is not initialized. ` +
          `Call ctf-evidence-board command=init before ctf-team-dispatch.` +
          (snapshot.evidenceError ? ` ${snapshot.evidenceError}` : ""),
      }
    }
    if (!hasExactlyThreeActiveRoutes(snapshot)) {
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: ctf-team-dispatch requires exactly 3 active Evidence routes. ` +
          `Current routes=${snapshot.routeIds.length}, active=${snapshot.activeRouteIds.length}. ` +
          `Call ctf-evidence-board command=set-routes with exactly 3 routes first.`,
      }
    }

    const jobs = dispatchJobs(args)
    if (jobs.length < 2) {
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: ctf-team-dispatch requires at least 2 route-bound jobs. ` +
          `Dispatch a real parallel Team Mode wave instead of an empty or single-worker run.`,
      }
    }
    const invalidRoute = jobs.find((job) => {
      const routeId = safeString(job.routeId)
      return !ROUTE_EXCEPTIONS.has(routeId) && !snapshot.activeRouteIds.includes(routeId)
    })
    if (invalidRoute) {
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: every Team job must bind to one of the current Evidence routes ` +
          `(${snapshot.activeRouteIds.join(", ")}) or recon/general.`,
      }
    }
    return { allowed: true }
  }

  if (TEAM_CONTROL_TOOLS.has(toolName) || PRE_TEAM_TOOLS.has(toolName)) {
    return { allowed: true }
  }

  // Generic shell and every non-core CTF tool are active investigation tools.
  // They are available only after a Team wave has been dispatched.
  if (!snapshot.teamDispatched) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: tool "${toolName}" is blocked before the first Team Mode wave. ` +
        `Complete this sequence: evidence-board init → recall → set-routes (3) → ` +
        `ctf-team-dispatch (at least 2 jobs).`,
    }
  }

  if (!snapshot.teamStateReadable) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: cannot verify persisted Team state before running "${toolName}". ` +
        `${snapshot.teamError ?? "Repair .ctf-team.json and retry."}`,
    }
  }

  if (snapshot.teamRunStatus && !["completed", "cancelled"].includes(snapshot.teamRunStatus)) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: Team wave is still ${snapshot.teamRunStatus}; direct investigation tool "${toolName}" is blocked. ` +
        `Use ctf-team-status, then collect/cancel/close the current wave before starting another investigation action.`,
    }
  }

  return { allowed: true }
}

export async function enforceExpertToolPolicy(args: {
  directory: string
  sessionID?: string
  agentName: string
  toolName: string
  toolArgs?: ToolArgs
}) {
  if (args.agentName !== "ctf-expert") return
  const snapshot = await loadExpertPolicySnapshot(args.directory, args.sessionID)
  const decision = evaluateExpertToolPolicy(snapshot, args.toolName, args.toolArgs)
  if (!decision.allowed) {
    console.warn(
      `[plugin] expert-policy deny session=${String(args.sessionID ?? "").slice(0, 12)} ` +
        `tool=${args.toolName} routes=${snapshot.routeIds.length}/${snapshot.activeRouteIds.length} ` +
        `team=${snapshot.teamDispatched}`,
    )
    throw new Error(
      decision.reason ?? `ExpertPolicyError: tool "${args.toolName}" is not allowed in the current phase.`,
    )
  }
}
