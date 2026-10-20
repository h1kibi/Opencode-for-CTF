import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { inspectExpertRuntime } from "../src/expert-watchdog.ts"

describe("Expert watchdog", () => {
  it("reports synthesis and live-route cleanup drift", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-watchdog-"))
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
          schemaVersion: 1,
          revision: 1,
          updatedAt: new Date().toISOString(),
          activeRunID: "run-1",
          runs: [
            {
              id: "run-1",
              parentSessionID: "expert-1",
              status: "ready_for_synthesis",
              jobs: [
                { id: "job-1", routeId: "R1", status: "running" },
                { id: "job-2", routeId: "R2", status: "running" },
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
