import { describe, expect, it } from "vitest"
import { evaluateExpertToolPolicy, type ExpertPolicySnapshot } from "../src/expert-policy.ts"

function snapshot(overrides: Partial<ExpertPolicySnapshot> = {}): ExpertPolicySnapshot {
  return {
    evidenceInitialized: true,
    routeIds: ["R1", "R2", "R3"],
    activeRouteIds: ["R1", "R2", "R3"],
    teamDispatched: false,
    teamRunIds: [],
    teamStateReadable: true,
    ...overrides,
  }
}

describe("Expert policy gate", () => {
  it("requires Evidence initialization before dispatch", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ evidenceInitialized: false, routeIds: [], activeRouteIds: [] }),
      "ctf-team-dispatch",
      { jobs: [{ routeId: "R1" }, { routeId: "R2" }] },
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("Evidence board is not initialized")
  })

  it("requires exactly three active routes before dispatch", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1", "R2"], activeRouteIds: ["R1", "R2"] }),
      "ctf-team-dispatch",
      { jobs: [{ routeId: "R1" }, { routeId: "R2" }] },
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("exactly 3 active Evidence routes")
  })

  it("requires at least two jobs for a Team wave", () => {
    const result = evaluateExpertToolPolicy(snapshot(), "ctf-team-dispatch", {
      jobs: [{ routeId: "R1" }],
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("at least 2 route-bound jobs")
  })
  it("rejects Team jobs that are not bound to current routes", () => {
    const result = evaluateExpertToolPolicy(snapshot(), "ctf-team-dispatch", {
      jobs: [{ routeId: "R1" }, { routeId: "R4" }],
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("current Evidence routes")
  })

  it("rejects duplicate route ids even when the board has three entries", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1", "R1", "R3"], activeRouteIds: ["R1", "R1", "R3"] }),
      "ctf-team-dispatch",
      { jobs: [{ routeId: "R1" }, { routeId: "R3" }] },
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("exactly 3 active Evidence routes")
  })
  it("blocks active investigation before the first Team wave", () => {
    const result = evaluateExpertToolPolicy(snapshot(), "bash")

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("before the first Team Mode wave")
  })

  it("blocks unknown CTF tools before the first Team wave", () => {
    const result = evaluateExpertToolPolicy(snapshot(), "ctf-pwn-runner")

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("ctf-pwn-runner")
  })

  it("blocks direct investigation while the current Team wave is still active", () => {
    for (const status of ["dispatching", "running", "ready_for_synthesis", "degraded", "cancelling"] as const) {
      const result = evaluateExpertToolPolicy(snapshot({ teamDispatched: true, teamRunStatus: status }), "bash")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain(`Team wave is still ${status}`)
    }
  })
  it("allows active investigation after Team dispatch", () => {
    expect(evaluateExpertToolPolicy(snapshot({ teamDispatched: true }), "bash").allowed).toBe(true)
    expect(evaluateExpertToolPolicy(snapshot({ teamDispatched: true }), "ctf-pwn-runner").allowed).toBe(true)
  })

  it("rejects ordinary task/delegate even after Team dispatch", () => {
    for (const tool of ["task", "delegate"]) {
      const result = evaluateExpertToolPolicy(snapshot({ teamDispatched: true }), tool)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("ctf-team-dispatch")
    }
  })

  it("keeps bootstrap and Team control tools available before dispatch", () => {
    for (const tool of [
      "ctf-env-check",
      "ctf-route-plan",
      "ctf-evidence-board",
      "ctf-team-status",
      "ctf-team-recover",
      "ctf-team-adopt",
      "read",
    ]) {
      expect(evaluateExpertToolPolicy(snapshot(), tool).allowed).toBe(true)
    }
  })
})
