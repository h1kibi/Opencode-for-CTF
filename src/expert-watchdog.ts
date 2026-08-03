import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEvidenceDir, readCurrentEvidenceSlug } from "../scripts/evidence-helper.ts"
import { isTerminalJob, readTeamState } from "./team/team-state.ts"

export type ExpertWatchdogReport = {
  warnings: string[]
  liveRouteIds: string[]
  activeWorkerCount: number
  activeRunIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readBoard(directory: string): Promise<Record<string, unknown> | undefined> {
  const slug = readCurrentEvidenceSlug(directory)
  if (!slug) return undefined
  try {
    return JSON.parse(
      await readFile(path.join(getEvidenceDir(directory, slug), ".ctf-evidence-board.json"), "utf8"),
    ) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** Non-blocking diagnostics for Expert idle points and Team lifecycle drift. */
export async function inspectExpertRuntime(directory: string, sessionID?: string): Promise<ExpertWatchdogReport> {
  const warnings: string[] = []
  const board = await readBoard(directory)
  const routes = board && Array.isArray(board.routes) ? board.routes.filter(isRecord) : []
  const activeRoutes = routes.filter((route) => route.state !== "dead")
  const liveRouteIds = routes
    .filter((route) => route.state === "live")
    .map((route) => String(route.id ?? ""))
    .filter(Boolean)

  if (board && (routes.length !== 3 || activeRoutes.length !== 3)) {
    warnings.push(`Evidence board route invariant is not ready: routes=${routes.length}, active=${activeRoutes.length}`)
  }

  let teamState
  try {
    teamState = await readTeamState(directory)
  } catch (error) {
    warnings.push(`Team state cannot be read: ${error instanceof Error ? error.message : String(error)}`)
    return { warnings, liveRouteIds, activeWorkerCount: 0, activeRunIds: [] }
  }

  const ownedRuns = sessionID ? teamState.runs.filter((run) => run.parentSessionID === sessionID) : teamState.runs
  const activeRuns = ownedRuns.filter((run) => !["completed", "cancelled"].includes(run.status))
  const activeJobs = activeRuns.flatMap((run) => run.jobs.filter((job) => !isTerminalJob(job.status)))

  if (activeRuns.some((run) => ["ready_for_synthesis", "degraded"].includes(run.status))) {
    warnings.push("Team run is ready for synthesis; call ctf-team-collect before another investigation wave")
  }
  if (liveRouteIds.length > 0) {
    const otherRouteJobs = activeJobs.filter((job) => !liveRouteIds.includes(job.routeId))
    if (otherRouteJobs.length > 0) {
      warnings.push(
        `Live route ${liveRouteIds.join(", ")} exists while ${otherRouteJobs.length} worker(s) remain on other routes; call ctf-team-cancel-route`,
      )
    }
  }

  return {
    warnings,
    liveRouteIds,
    activeWorkerCount: activeJobs.length,
    activeRunIds: activeRuns.map((run) => run.id),
  }
}
