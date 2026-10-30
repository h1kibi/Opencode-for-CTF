import { readFile } from "node:fs/promises"
import path from "node:path"
import { INACTIVE_ROUTE_STATE } from "ctf-core"
import { getEvidenceDir, readCurrentEvidenceSlug } from "../scripts/evidence-helper.ts"
import { DEFAULT_ROUTE_POLICY, type RoutePolicy } from "./plugin-config.ts"
import { emptyTeamState, readTeamState, teamStatePath } from "./team/team-state.ts"
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
  /** Active-route band; defaults to DEFAULT_ROUTE_POLICY when not injected. */
  routePolicy?: RoutePolicy
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
    .filter((route) => safeString(route.state) !== INACTIVE_ROUTE_STATE)
    .map((route) => safeString(route.id))
    .filter(Boolean)
  return { routeIds, activeRouteIds }
}

async function readEvidenceSnapshot(directory: string): Promise<{
  initialized: boolean
  routeIds: string[]
  activeRouteIds: string[]
  error?: string
}> {
  const slug = readCurrentEvidenceSlug(directory)
  if (!slug) {
    return { initialized: false, routeIds: [], activeRouteIds: [] }
  }

  const boardPath = path.join(getEvidenceDir(directory, slug), ".ctf-evidence-board.json")
  try {
    const raw = JSON.parse(await readFile(boardPath, "utf8")) as unknown
    return { initialized: true, ...activeRouteIdsFromBoard(raw) }
  } catch (error) {
    // A slug with an unreadable board is not an initialized case: the Expert
    // must re-init instead of dispatching against routes we cannot read.
    return {
      initialized: false,
      routeIds: [],
      activeRouteIds: [],
      error: `Evidence board ${boardPath} is unreadable (${error instanceof Error ? error.message : String(error)}).`,
    }
  }
}

function teamRunsForSession(state: TeamState, sessionID: string) {
  return state.runs.filter((run) => run.parentSessionID === sessionID)
}

export async function loadExpertPolicySnapshot(
  directory: string,
  sessionID?: string,
  routePolicy?: RoutePolicy,
): Promise<ExpertPolicySnapshot> {
  const evidence = await readEvidenceSnapshot(directory)

  let teamState: TeamState
  let teamError: string | undefined
  let teamStateReadable = true
  try {
    teamState = await readTeamState(directory)
  } catch (error) {
    teamState = emptyTeamState()
    teamStateReadable = false
    teamError = `Team state ${teamStatePath(directory)} is unreadable (${error instanceof Error ? error.message : String(error)}).`
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
    teamStateReadable,
    ...(evidence.error ? { evidenceError: evidence.error } : {}),
    ...(teamError ? { teamError } : {}),
    routePolicy: routePolicy ?? { ...DEFAULT_ROUTE_POLICY },
  }
}

export type ExpertPolicyDecision = {
  allowed: boolean
  reason?: string
}

function dispatchProbes(args: ToolArgs): Array<Record<string, unknown>> {
  return Array.isArray(args.probes) ? args.probes.filter(isRecord) : []
}

function hasRequiredActiveRoutes(snapshot: ExpertPolicySnapshot): boolean {
  const band = snapshot.routePolicy ?? DEFAULT_ROUTE_POLICY
  const { routeIds, activeRouteIds } = snapshot
  return (
    routeIds.length >= band.min &&
    routeIds.length <= band.max &&
    activeRouteIds.length >= band.min &&
    activeRouteIds.length <= band.max &&
    new Set(routeIds).size === routeIds.length &&
    new Set(activeRouteIds).size === activeRouteIds.length
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
        `Use ctf-team-dispatch for a bounded, route-bound Probe.`,
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
    if (!hasRequiredActiveRoutes(snapshot)) {
      const band = snapshot.routePolicy ?? DEFAULT_ROUTE_POLICY
      const distinct =
        new Set(snapshot.routeIds).size === snapshot.routeIds.length &&
        new Set(snapshot.activeRouteIds).size === snapshot.activeRouteIds.length
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: ctf-team-dispatch requires ${band.min}-${band.max} distinct active Evidence routes ` +
          `(route_policy). Current routes=${snapshot.routeIds.length}, active=${snapshot.activeRouteIds.length}` +
          (distinct ? "" : ", with duplicate route ids") +
          `. Call ctf-evidence-board command=set-routes with ${band.min}-${band.max} distinct routes first.`,
      }
    }

    const probes = dispatchProbes(args)
    if (probes.length < 1) {
      return {
        allowed: false,
        reason: "ExpertPolicyError: ctf-team-dispatch requires at least one explicit route-bound Probe.",
      }
    }
    const invalidRoute = probes.find((probe) => {
      const routeId = safeString(probe.routeId)
      return !ROUTE_EXCEPTIONS.has(routeId) && !snapshot.activeRouteIds.includes(routeId)
    })
    if (invalidRoute) {
      return {
        allowed: false,
        reason:
          `ExpertPolicyError: every Probe must bind to one of the current Evidence routes ` +
          `(${snapshot.activeRouteIds.join(", ")}) or recon/general.`,
      }
    }
    return { allowed: true }
  }

  if (TEAM_CONTROL_TOOLS.has(toolName) || PRE_TEAM_TOOLS.has(toolName)) {
    return { allowed: true }
  }

  if (!snapshot.teamStateReadable) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: cannot verify persisted Team state before running "${toolName}". ` +
        `${snapshot.teamError ?? "Repair .ctf-team.json and retry."}`,
    }
  }

  if (!snapshot.teamDispatched) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: tool "${toolName}" is blocked before the first Team Probe. ` +
        `Complete this sequence: evidence-board init → set-routes → ctf-team-dispatch (one or more Probes).`,
    }
  }

  if (snapshot.teamRunStatus && !["completed", "cancelled"].includes(snapshot.teamRunStatus)) {
    return {
      allowed: false,
      reason:
        `ExpertPolicyError: Team run is still ${snapshot.teamRunStatus}; direct investigation tool "${toolName}" is blocked. ` +
        `Use ctf-team-status, then collect/cancel/close the current run before dispatching another Probe.`,
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
  routePolicy?: RoutePolicy
}) {
  if (args.agentName !== "ctf-expert") return
  const snapshot = await loadExpertPolicySnapshot(args.directory, args.sessionID, args.routePolicy)
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
