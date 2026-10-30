import type { TeamRun } from "./team-types.ts"

export type FailureMode = "worker_unsolved" | "route_killed_early" | "budget_exhausted"

export type FailureAttribution = {
  modes: FailureMode[]
  signals: string[]
  at: string
}

type BoardRouteLite = { id?: string; state?: string; attempts?: number }

export function classifyRunFailure(
  run: TeamRun,
  boardRoutes?: BoardRouteLite[],
  at = new Date().toISOString(),
): FailureAttribution {
  const modes: FailureMode[] = []
  const signals: string[] = []
  const deadlineJobs = run.jobs.filter(
    (job) =>
      (job.status === "interrupted" && /deadline|timeout|timed out/i.test(String(job.error ?? ""))) ||
      (job.status === "failed" && (job.attempt ?? 0) >= 1),
  )
  if (deadlineJobs.length) {
    modes.push("budget_exhausted")
    signals.push(`deadline-driven terminal jobs: ${deadlineJobs.map((job) => job.id).join(", ")}`)
  }

  const earlyDead = (boardRoutes ?? []).filter((route) => route.state === "dead" && (route.attempts ?? 0) < 2)
  if (earlyDead.length) {
    modes.push("route_killed_early")
    signals.push(`routes dead below the 2-attempt floor: ${earlyDead.map((route) => route.id).join(", ")}`)
  }

  if (run.outcome !== "solved" && !modes.length) {
    modes.push("worker_unsolved")
    signals.push(
      `run closed as ${run.outcome ?? "unspecified"} with ${run.jobs.length} terminal job(s) and no specific failure signal`,
    )
  }

  return { modes, signals, at }
}
