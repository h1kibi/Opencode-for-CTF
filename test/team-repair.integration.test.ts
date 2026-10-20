import { mkdtempSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createTeamTools } from "../src/team-runtime.ts"
import { readTeamState } from "../src/team/team-state.ts"

function client(abortResult: unknown = { data: {} }) {
  let created = 0
  return {
    session: {
      abort: async () => abortResult,
      create: async () => ({ data: { id: `new-worker-${++created}` } }),
      promptAsync: async () => ({ data: {} }),
      messages: async ({ path: requestPath }: { path: { id: string } }) => ({
        data: requestPath.id.startsWith("new-worker-")
          ? [{ info: { role: "assistant" }, parts: [{ type: "text", text: "STATUS: completed" }] }]
          : [{ info: { role: "assistant", providerID: "test-provider", modelID: "test-model" }, parts: [] }],
      }),
      status: async () => ({ data: {} }),
    },
    mcp: {
      status: async () => ({ data: {} }),
      add: async () => ({ data: {} }),
      connect: async () => ({ data: {} }),
    },
  }
}

async function seed(directory: string, agent = "ctf-web-removed") {
  await writeFile(
    path.join(directory, ".ctf-team.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      updatedAt: "2026-08-03T00:00:00.000Z",
      activeRunID: "run-old",
      runs: [
        {
          id: "run-old",
          title: "stale wave",
          parentSessionID: "parent-old",
          status: "running",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          notificationPending: false,
          jobs: [
            {
              id: "job-old",
              title: "old worker",
              objective: "repair",
              agent,
              routeId: "R1",
              concurrency: "independent",
              sessionID: "worker-old",
              status: "running",
              createdAt: "2026-08-03T00:00:00.000Z",
              updatedAt: "2026-08-03T00:00:00.000Z",
            },
          ],
        },
      ],
    }),
    "utf8",
  )
}

describe("Team repair runtime", () => {
  it("returns actionable JSON for a malformed state file from team status", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-status-corrupt-"))
    try {
      await writeFile(path.join(directory, ".ctf-team.json"), "{broken", "utf8")
      const tools = createTeamTools(client(), directory)
      const result = JSON.parse(String(await tools["ctf-team-status"].execute({}, { directory } as never)))
      expect(result.stateReadable).toBe(false)
      expect(result.repairCommands).toContain("ctf-team-repair operation=inspect")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("keeps an orphaned run recoverable when non-force repair cannot abort its session", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-repair-abort-fail-"))
    try {
      await seed(directory)
      const tools = createTeamTools(client({ error: "session unavailable" }), directory)
      const result = JSON.parse(
        String(
          await tools["ctf-team-repair"].execute({ operation: "cancel_orphans", reason: "attempt repair" }, {
            agent: "ctf-expert",
            sessionID: "parent-new",
            directory,
          } as never),
        ),
      )
      expect(result.state.runs[0].status).not.toBe("cancelled")
      expect(result.state.runs[0].jobs[0].status).toBe("orphaned")
      expect(result.state.runs[0].jobs[0].orphaned.recoverable).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("isolates recoverable orphan runs without destroying later adoption", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-orphan-dispatch-"))
    try {
      await seed(directory)
      const tools = createTeamTools(client(), directory)
      await tools["ctf-team-dispatch"].execute(
        {
          title: "replacement wave",
          jobs: [
            {
              title: "route one",
              objective: "inspect route one",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
            },
            {
              title: "route two",
              objective: "inspect route two",
              agent: "ctf-pwn",
              routeId: "R2",
              concurrency: "independent",
            },
          ],
        },
        { agent: "ctf-expert", sessionID: "parent-new", directory } as never,
      )
      const state = await readTeamState(directory)
      const old = state.runs.find((run) => run.id === "run-old")
      const replacement = state.runs.find((run) => run.id !== "run-old")
      expect(old?.status).toBe("degraded")
      expect(old?.jobs[0].orphaned?.recoverable).toBe(true)
      expect(old?.synthesisSummary).toContain("remain adoptable")
      expect(state.activeRunID).toBe(replacement?.id)
      expect(replacement?.status).toBe("running")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("force-cancels orphaned jobs and leaves a clean state for a new dispatch", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "ctf-team-force-cancel-"))
    try {
      await seed(directory)
      const tools = createTeamTools(client(), directory)
      const result = String(
        await tools["ctf-team-cancel"].execute({ runID: "run-old", reason: "cleanup stale run", force: true }, {
          agent: "ctf-expert",
          sessionID: "parent-new",
          directory,
        } as never),
      )
      expect(result).toContain("run_id: run-old")
      const state = await readTeamState(directory)
      expect(state.runs[0].jobs[0].status).toBe("cancelled")
      expect(state.activeRunID).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
