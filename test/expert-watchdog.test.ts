import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { inspectExpertRuntime } from "../src/expert-watchdog.ts"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

describe("Expert watchdog", () => {
  it("reports synthesis and live-route cleanup drift", async () => {
    const directory = await makeTestWorkspaceAsync("ctf-watchdog")
    const evidenceDir = path.join(directory, "work", "ctf-evidence", "demo")
    try {
      await mkdir(evidenceDir, { recursive: true })
      await writeFile(path.join(directory, "work", "ctf-evidence", ".current"), "demo\n")
      await writeFile(
        path.join(evidenceDir, ".ctf-evidence-board.json"),
        JSON.stringify({
          routes: [
            { id: "R1", state: "live" },
            { id: "R2", state: "blocked" },
            { id: "R3", state: "untested" },
          ],
        }),
      )
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 2,
          revision: 1,
          updatedAt: new Date().toISOString(),
          activeRunID: "run-1",
          runs: [
            {
              id: "run-1",
              title: "watchdog",
              parentSessionID: "expert-1",
              status: "ready_for_synthesis",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              notificationPending: true,
              probes: [
                {
                  id: "probe-1",
                  title: "R1",
                  objective: "live",
                  agent: "ctf-web",
                  routeId: "R1",
                  concurrency: "independent",
                  status: "running",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                {
                  id: "probe-2",
                  title: "R2",
                  objective: "other",
                  agent: "ctf-pwn",
                  routeId: "R2",
                  concurrency: "independent",
                  status: "running",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ],
              jobs: [
                {
                  id: "job-1",
                  probeId: "probe-1",
                  agent: "ctf-web",
                  status: "running",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  timeoutMs: 60_000,
                  attempt: 0,
                  ownerToken: "owner-1",
                },
                {
                  id: "job-2",
                  probeId: "probe-2",
                  agent: "ctf-pwn",
                  status: "running",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  timeoutMs: 60_000,
                  attempt: 0,
                  ownerToken: "owner-2",
                },
              ],
            },
          ],
        }),
      )

      const report = await inspectExpertRuntime(directory, "expert-1")
      expect(report.activeWorkerCount).toBe(2)
      expect(report.liveRouteIds).toEqual(["R1"])
      expect(report.warnings.join("\n")).toContain("ready for synthesis")
      expect(report.warnings.join("\n")).toContain("ctf-team-cancel-route")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
