import type { TeamRun, TeamState } from "./team-types.ts"
import { MAX_COLLECT_OUTPUT } from "./team-types.ts"

export function renderRun(run: TeamRun, includeResults = false) {
  const lines = [
    `run_id: ${run.id}`,
    `title: ${run.title}`,
    `status: ${run.status}`,
    `parent_session: ${run.parentSessionID}`,
    ...(run.adoptionHistory?.length ? [`parent_adoptions: ${run.adoptionHistory.length}`] : []),
    `jobs: ${run.jobs.length}`,
  ]
  for (const job of run.jobs) {
    lines.push(
      `- ${job.id} | ${job.orphaned?.originalAgent ?? job.agent} | route=${job.routeId ?? "?"} | ${job.concurrency ?? "independent"} | ${job.status}${job.orphaned ? ` (${job.orphaned.reason})` : ""} | ${job.title}`,
    )
    if (job.deadlineAt) {
      const deadlineNote =
        `  deadline: ${job.deadlineAt}` +
        (job.lastHeartbeatAt ? ` | last_heartbeat: ${job.lastHeartbeatAt}` : "") +
        (typeof job.attempt === "number" && job.attempt > 0 ? ` | attempts: ${job.attempt}` : "")
      lines.push(deadlineNote)
    }
    if (job.error) lines.push(`  error: ${job.error}`)
    if (job.errorDetails) {
      lines.push(
        `  error_details: type=${job.errorDetails.errorType} phase=${job.errorDetails.phase} ` +
          `retryable=${job.errorDetails.retryable} parent=${job.errorDetails.parentSessionID} ` +
          `child=${job.errorDetails.childSessionID ?? "(none)"}`,
      )
    }
    if (includeResults && job.result) lines.push(`  result:\n${job.result}`)
  }
  return lines.join("\n").slice(0, MAX_COLLECT_OUTPUT)
}

export function summarizeTeamState(state: TeamState, sessionID?: string) {
  const relevant = state.runs
    .filter((r) => !sessionID || r.parentSessionID === sessionID || r.jobs.some((j) => j.sessionID === sessionID))
    .slice(-3)
  return {
    revision: state.revision,
    activeRunID: state.activeRunID,
    runs: relevant.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      jobs: r.jobs.map((j) => ({
        id: j.id,
        title: j.title,
        agent: j.orphaned?.originalAgent ?? j.agent,
        orphaned: j.orphaned,
        routeId: j.routeId,
        concurrency: j.concurrency,
        status: j.status,
        error: j.error,
        errorDetails: j.errorDetails,
      })),
      outcome: r.outcome,
      synthesisSummary: r.synthesisSummary,
      adoptionHistory: r.adoptionHistory,
    })),
  }
}
