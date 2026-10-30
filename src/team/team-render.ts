import type { TeamRun, TeamState } from "./team-types.ts"
import { MAX_COLLECT_OUTPUT } from "./team-types.ts"

export function renderRun(run: TeamRun, includeResults = false) {
  const lines = [
    `run_id: ${run.id}`,
    `title: ${run.title}`,
    `status: ${run.status}`,
    `parent_session: ${run.parentSessionID}`,
    ...(run.adoptionHistory?.length ? [`parent_adoptions: ${run.adoptionHistory.length}`] : []),
    `probes: ${run.probes.length}`,
    `jobs: ${run.jobs.length}`,
  ]
  for (const job of run.jobs) {
    const probe = run.probes.find((candidate) => candidate.id === job.probeId)
    lines.push(
      `- ${job.id} | probe=${job.probeId} | ${job.orphaned?.originalAgent ?? job.agent} | route=${probe?.routeId ?? "?"} | ${probe?.status ?? "?"} | ${job.status}${job.orphaned ? ` (${job.orphaned.reason})` : ""} | ${probe?.title ?? "unknown probe"}`,
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
    if (includeResults && probe?.result) {
      lines.push(`  probe_result: ${probe.result.status} | ${probe.result.summary}`)
      for (const observation of probe.result.observations) {
        lines.push(`    - [${observation.kind}] ${observation.statement}`)
        for (const evidence of observation.evidence) lines.push(`      evidence: ${evidence.type}=${evidence.value}`)
      }
      if (probe.result.artifacts.length) lines.push(`    artifacts: ${probe.result.artifacts.join(", ")}`)
      if (probe.result.next) lines.push(`    next: ${probe.result.next}`)
    }
    if (includeResults && job.result) lines.push(`  raw_result:\n${job.result}`)
  }
  if (run.failureAttribution?.modes?.length) {
    lines.push(
      `failure_attribution: ${run.failureAttribution.modes.join(", ")} (at ${run.failureAttribution.at})`,
      ...run.failureAttribution.signals.map((sig) => `  signal: ${sig}`),
    )
  }
  return lines.join("\n").slice(0, MAX_COLLECT_OUTPUT)
}

export function summarizeTeamState(state: TeamState, sessionID?: string) {
  const relevant = state.runs
    .filter(
      (run) => !sessionID || run.parentSessionID === sessionID || run.jobs.some((job) => job.sessionID === sessionID),
    )
    .slice(-3)
  return {
    revision: state.revision,
    activeRunID: state.activeRunID,
    runs: relevant.map((run) => ({
      id: run.id,
      title: run.title,
      status: run.status,
      probes: run.probes.map((probe) => ({
        id: probe.id,
        title: probe.title,
        routeId: probe.routeId,
        status: probe.status,
        result: probe.result,
      })),
      jobs: run.jobs.map((job) => ({
        probeId: job.probeId,
        id: job.id,
        agent: job.orphaned?.originalAgent ?? job.agent,
        orphaned: job.orphaned,
        status: job.status,
        error: job.error,
        errorDetails: job.errorDetails,
      })),
      outcome: run.outcome,
      synthesisSummary: run.synthesisSummary,
      adoptionHistory: run.adoptionHistory,
    })),
  }
}
