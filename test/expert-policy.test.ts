import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { evaluateExpertToolPolicy, loadExpertPolicySnapshot, type ExpertPolicySnapshot } from "../src/expert-policy.ts"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

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
      { probes: [{ routeId: "R1" }, { routeId: "R2" }] },
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("Evidence board is not initialized")
  })

  it("enforces the default route_policy band (2-6) before dispatch", () => {
    const below = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1"], activeRouteIds: ["R1"] }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R1" }] },
    )
    expect(below.allowed).toBe(false)
    expect(below.reason).toContain("2-6 distinct active Evidence routes")

    const above = evaluateExpertToolPolicy(
      snapshot({
        routeIds: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
        activeRouteIds: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"],
      }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R1" }] },
    )
    expect(above.allowed).toBe(false)
    expect(above.reason).toContain("2-6 distinct active Evidence routes")

    const atMin = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1", "R2"], activeRouteIds: ["R1", "R2"] }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R2" }] },
    )
    expect(atMin.allowed).toBe(true)
  })

  it("honors a configured route_policy band", () => {
    const band = { min: 3, max: 5 }
    const tooFew = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1", "R2"], activeRouteIds: ["R1", "R2"], routePolicy: band }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R1" }] },
    )
    expect(tooFew.allowed).toBe(false)
    expect(tooFew.reason).toContain("3-5 distinct active Evidence routes")

    const atMax = evaluateExpertToolPolicy(
      snapshot({
        routeIds: ["R1", "R2", "R3", "R4", "R5"],
        activeRouteIds: ["R1", "R2", "R3", "R4", "R5"],
        routePolicy: band,
      }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R5" }] },
    )
    expect(atMax.allowed).toBe(true)
  })

  it("allows one explicit Probe and rejects missing or unauthorized routes", () => {
    expect(evaluateExpertToolPolicy(snapshot(), "ctf-team-dispatch", { probes: [] }).allowed).toBe(false)
    expect(evaluateExpertToolPolicy(snapshot(), "ctf-team-dispatch", { probes: [{ routeId: "R1" }] }).allowed).toBe(
      true,
    )
    const outside = evaluateExpertToolPolicy(snapshot(), "ctf-team-dispatch", { probes: [{ routeId: "R4" }] })
    expect(outside.allowed).toBe(false)
    expect(outside.reason).toContain("current Evidence routes")
  })

  it("rejects duplicate route ids in the Evidence board even for a Probe", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ routeIds: ["R1", "R1", "R3"], activeRouteIds: ["R1", "R1", "R3"] }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R1" }] },
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("duplicate route ids")
  })
  it("blocks active investigation before the first Team wave", () => {
    const result = evaluateExpertToolPolicy(snapshot(), "bash")

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("before the first Team Probe")
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
      expect(result.reason).toContain(`Team run is still ${status}`)
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

  it("reports unreadable Team state before the pre-dispatch sequence", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ teamStateReadable: false, teamError: "Team state .ctf-team.json is unreadable (boom)." }),
      "bash",
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("cannot verify persisted Team state")
    expect(result.reason).toContain("boom")
  })

  it("surfaces the evidence read error on a blocked dispatch", () => {
    const result = evaluateExpertToolPolicy(
      snapshot({ evidenceInitialized: false, routeIds: [], activeRouteIds: [], evidenceError: "board is unreadable" }),
      "ctf-team-dispatch",
      { probes: [{ routeId: "R1" }] },
    )

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("board is unreadable")
  })
})

describe("Expert policy snapshot loading", () => {
  it("turns an unreadable evidence board into a snapshot error", async () => {
    const directory = await makeTestWorkspaceAsync("expert-policy-board")
    try {
      const evidenceDir = path.join(directory, "work", "ctf-evidence")
      await mkdir(path.join(evidenceDir, "2610251156"), { recursive: true })
      await writeFile(path.join(evidenceDir, ".current"), "2610251156\n", "utf8")
      await writeFile(path.join(evidenceDir, "2610251156", ".ctf-evidence-board.json"), "{ not json", "utf8")

      const loaded = await loadExpertPolicySnapshot(directory)

      expect(loaded.evidenceInitialized).toBe(false)
      expect(loaded.evidenceError).toContain("unreadable")
      expect(loaded.routeIds).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("turns a corrupt Team state into a snapshot error", async () => {
    const directory = await makeTestWorkspaceAsync("expert-policy-team")
    try {
      await writeFile(path.join(directory, ".ctf-team.json"), '{"schemaVersion":2,"runs":"nope"}', "utf8")

      const loaded = await loadExpertPolicySnapshot(directory)

      expect(loaded.teamStateReadable).toBe(false)
      expect(loaded.teamError).toContain("unreadable")
      expect(loaded.teamDispatched).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
