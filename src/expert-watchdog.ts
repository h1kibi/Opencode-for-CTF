import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEvidenceDir, readCurrentEvidenceSlug } from "../scripts/evidence-helper.ts"
import { DEFAULT_ROUTE_POLICY } from "./plugin-config.ts"
import { isTerminalTeamJob } from "./team-reducer.ts"
import { readTeamState } from "./team/team-state.ts"
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
  return JSON.parse(
    await readFile(path.join(getEvidenceDir(directory, slug), ".ctf-evidence-board.json"), "utf8"),
  ) as Record<string, unknown>
}

/** Non-blocking diagnostics for Expert idle points and Team lifecycle drift. */
export async function inspectExpertRuntime(
  directory: string,
  sessionID?: string,
  routePolicy: { min: number; max: number } = DEFAULT_ROUTE_POLICY,
): Promise<ExpertWatchdogReport> {
  const warnings: string[] = []
  const board = await readBoard(directory)
  const routes = board && Array.isArray(board.routes) ? board.routes.filter(isRecord) : []
  const activeRoutes = routes.filter((route) => route.state !== "dead")
  const liveRouteIds = routes
    .filter((route) => route.state === "live")
    .map((route) => String(route.id ?? ""))
    .filter(Boolean)

  const withinBand = (count: number) => count >= routePolicy.min && count <= routePolicy.max
  if (board && (!withinBand(routes.length) || !withinBand(activeRoutes.length))) {
    warnings.push(
      `Evidence board route invariant is not ready: routes=${routes.length}, active=${activeRoutes.length} ` +
        `(route_policy band ${routePolicy.min}-${routePolicy.max})`,
    )
  }

  const teamState = await readTeamState(directory)

  const ownedRuns = sessionID ? teamState.runs.filter((run) => run.parentSessionID === sessionID) : teamState.runs
  const activeRuns = ownedRuns.filter((run) => !["completed", "cancelled"].includes(run.status))
  const activeJobs = activeRuns.flatMap((run) => run.jobs.filter((job) => !isTerminalTeamJob(job.status)))

  if (activeRuns.some((run) => ["ready_for_synthesis", "degraded"].includes(run.status))) {
    warnings.push("Team run is ready for synthesis; call ctf-team-collect before another investigation wave")
  }
  if (liveRouteIds.length > 0) {
    const otherRouteJobs = activeJobs.filter((job) => {
      const probe = ownedRuns.flatMap((run) => run.probes).find((candidate) => candidate.id === job.probeId)
      return !liveRouteIds.includes(probe?.routeId ?? "general")
    })
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
