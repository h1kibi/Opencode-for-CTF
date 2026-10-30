import { describe, expect, it } from "vitest"
import { classifyRunFailure } from "../src/team/failure-attribution.ts"
import type { TeamRun } from "../src/team/team-types.ts"

function run(overrides: Partial<TeamRun> = {}): TeamRun {
  return {
    id: "run-1",
    title: "t",
    parentSessionID: "p",
    status: "completed",
    createdAt: "x",
    updatedAt: "x",
    probes: [],
    jobs: [],
    notificationPending: false,
    ...overrides,
  }
}

function job(id: string, status: TeamRun["jobs"][number]["status"], extra: Record<string, unknown> = {}) {
  return {
    id,
    probeId: `probe-${id}`,
    agent: "ctf-pwn",
    status,
    createdAt: "x",
    updatedAt: "x",
    ...extra,
  } as TeamRun["jobs"][number]
}

describe("classifyRunFailure", () => {
  it("labels worker_unsolved when nothing specific explains the miss", () => {
    const result = classifyRunFailure(run({ outcome: "blocked", jobs: [job("j1", "completed")] }))
    expect(result.modes).toEqual(["worker_unsolved"])
    expect(result.signals.length).toBeGreaterThan(0)
  })

  it("labels budget_exhausted on deadline-driven interrupts and retried-out failures", () => {
    const interrupted = classifyRunFailure(
      run({ outcome: "blocked", jobs: [job("j1", "interrupted", { error: "worker exceeded deadline" })] }),
    )
    expect(interrupted.modes).toContain("budget_exhausted")

    const retriedOut = classifyRunFailure(run({ outcome: "blocked", jobs: [job("j2", "failed", { attempt: 2 })] }))
    expect(retriedOut.modes).toContain("budget_exhausted")
  })

  it("labels route_killed_early only for dead board routes below the attempt floor", () => {
    const result = classifyRunFailure(run({ outcome: "blocked" }), [
      { id: "R1", state: "dead", attempts: 1 },
      { id: "R2", state: "dead", attempts: 3 },
    ])
    expect(result.modes).toContain("route_killed_early")
    expect(result.signals.join(" ")).toContain("R1")
    expect(result.signals.join(" ")).not.toContain("R2")
  })

  it("does not attribute a solved run as a failure", () => {
    expect(classifyRunFailure(run({ outcome: "solved", jobs: [job("j1", "completed")] })).modes).toEqual([])
  })
})
