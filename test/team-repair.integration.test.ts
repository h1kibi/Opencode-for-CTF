import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createTeamTools } from "../src/team-runtime.ts"
import { readTeamState } from "../src/team/team-state.ts"
import { makeTestWorkspace } from "./support/test-workspace.ts"

function client(
  abortResult: unknown = { data: {} },
  promptCalls?: unknown[],
  abortResults?: unknown[],
  abortCalls?: string[],
) {
  let created = 0
  return {
    session: {
      abort: async ({ path: requestPath }: { path: { id: string } }) => {
        abortCalls?.push(requestPath.id)
        return abortResults?.length ? abortResults.shift() : abortResult
      },
      create: async () => ({ data: { id: `new-worker-${++created}` } }),
      promptAsync: async (request: unknown) => {
        promptCalls?.push(request)
        return { data: {} }
      },
      messages: async ({ path: requestPath }: { path: { id: string } }) => ({
        data: requestPath.id.startsWith("new-worker-")
          ? [
              {
                info: { role: "assistant" },
                parts: [
                  {
                    type: "text",
                    text:
                      "```json\n" +
                      JSON.stringify({
                        protocol: "ctf.team.probe.v1",
                        type: "probe_result",
                        status: "completed",
                        summary: "replacement result",
                        observations: [],
                        artifacts: [],
                      }) +
                      "\n```",
                  },
                ],
              },
            ]
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
      schemaVersion: 2,
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
          probes: [
            {
              id: "probe-old",
              title: "old worker",
              objective: "repair",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
              status: "running",
              createdAt: "2026-08-03T00:00:00.000Z",
              updatedAt: "2026-08-03T00:00:00.000Z",
            },
          ],
          jobs: [
            {
              id: "job-old",
              probeId: "probe-old",
              agent,
              sessionID: "worker-old",
              status: "running",
              createdAt: "2026-08-03T00:00:00.000Z",
              updatedAt: "2026-08-03T00:00:00.000Z",
              timeoutMs: 60_000,
              attempt: 0,
              ownerToken: "owner-old",
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
    const directory = makeTestWorkspace("ctf-team-status-corrupt")
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
    const directory = makeTestWorkspace("ctf-team-repair-abort-fail")
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
    const directory = makeTestWorkspace("ctf-team-orphan-dispatch")
    try {
      await seed(directory)
      const promptCalls: unknown[] = []
      const tools = createTeamTools(client({ data: {} }, promptCalls), directory)
      await tools["ctf-team-dispatch"].execute(
        {
          title: "replacement wave",
          probes: [
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
      expect(old?.synthesisSummary).toContain("Automatically isolated stale Team run before dispatch")
      expect(state.activeRunID).toBe(replacement?.id)
      expect(replacement?.status).toBe("running")
      expect(promptCalls).toHaveLength(2)
      for (const request of promptCalls as Array<{
        body?: {
          parts?: Array<{ text?: string }>
          tools?: Record<string, boolean>
        }
      }>) {
        const prompt = request.body?.parts?.[0]?.text ?? ""
        expect(prompt).toContain("Expected runtime surface: ctf-expert")
        expect(prompt).toContain("Expected plugin-visible tools: 0")
        expect(prompt).toContain("external_skills enabled: no")
        expect(prompt).toContain("protocol ctf.team.probe.v1")
        expect(request.body?.tools?.["ctf-team-dispatch"]).toBe(false)
        expect(request.body?.tools?.["ctf-team-status"]).toBe(false)
        expect(request.body?.tools?.["ctf-team-collect"]).toBe(false)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("force-cancels orphaned jobs and leaves a clean state for a new dispatch", async () => {
    const directory = makeTestWorkspace("ctf-team-force-cancel")
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

  it("cancels workers outside the kept route and persists probe state", async () => {
    const directory = makeTestWorkspace("ctf-team-cancel-route")
    try {
      await seed(directory, "ctf-web")
      const tools = createTeamTools(client(), directory)
      await tools["ctf-team-cancel-route"].execute(
        { runID: "run-old", keepRouteId: "R2", reason: "keep the live route" },
        { agent: "ctf-expert", sessionID: "parent-new", directory } as never,
      )
      const state = await readTeamState(directory)
      expect(state.runs[0].status).toBe("cancelled")
      expect(state.runs[0].jobs[0].status).toBe("cancelled")
      expect(state.runs[0].probes[0].status).toBe("cancelled")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("degrades route cancellation when a replacement follow-up abort fails", async () => {
    const directory = makeTestWorkspace("ctf-team-cancel-follow-up-failure")
    const abortCalls: string[] = []
    try {
      await seed(directory, "ctf-web")
      const state = await readTeamState(directory)
      state.runs[0].jobs[0].retrySessionID = "worker-replacement"
      await writeFile(path.join(directory, ".ctf-team.json"), JSON.stringify(state), "utf8")
      const tools = createTeamTools(
        client({ data: {} }, undefined, [{ data: {} }, { error: "replacement unavailable" }], abortCalls),
        directory,
      )
      await tools["ctf-team-cancel-route"].execute(
        { runID: "run-old", keepRouteId: "R2", reason: "abort stale route" },
        { agent: "ctf-expert", sessionID: "parent-new", directory } as never,
      )
      const after = await readTeamState(directory)
      expect(abortCalls).toEqual(["worker-old", "worker-replacement"])
      expect(after.runs[0].status).toBe("degraded")
      expect(after.runs[0].jobs[0].status).toBe("cancel_failed")
      expect(after.runs[0].jobs[0].retryPending).toBe(false)
      expect(after.runs[0].jobs[0].retrySessionID).toBeUndefined()
      expect(after.activeRunID).toBe("run-old")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("degrades route cancellation when the worker abort fails", async () => {
    const directory = makeTestWorkspace("ctf-team-cancel-route-failure")
    try {
      await seed(directory, "ctf-web")
      const tools = createTeamTools(client({ error: "session unavailable" }), directory)
      await tools["ctf-team-cancel-route"].execute(
        { runID: "run-old", keepRouteId: "R2", reason: "abort stale route" },
        { agent: "ctf-expert", sessionID: "parent-new", directory } as never,
      )
      const state = await readTeamState(directory)
      expect(state.runs[0].status).toBe("degraded")
      expect(state.runs[0].jobs[0].status).toBe("cancel_failed")
      expect(state.runs[0].probes[0].status).toBe("failed")
      expect(state.activeRunID).toBe("run-old")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("adopts an orphaned worker through the real Team tool path", async () => {
    const directory = makeTestWorkspace("ctf-team-adopt-orphan")
    try {
      await seed(directory, "ctf-web-removed")
      const tools = createTeamTools(client(), directory)
      const result = JSON.parse(
        String(
          await tools["ctf-team-adopt"].execute(
            {
              runID: "run-old",
              reason: "replace stale worker",
              orphaned: true,
              jobID: "job-old",
              agent: "ctf-pwn",
              force: true,
            },
            { agent: "ctf-expert", sessionID: "parent-old", directory } as never,
          ),
        ),
      )
      const state = await readTeamState(directory)
      const job = state.runs[0].jobs[0]
      expect(result).toMatchObject({
        adopted: true,
        orphaned: true,
        runID: "run-old",
        jobID: "job-old",
        agent: "ctf-pwn",
      })
      expect(job).toMatchObject({ agent: "ctf-pwn", status: "running", sessionID: "new-worker-1" })
      expect(job.orphaned).toBeUndefined()
      expect(job.adoptionHistory?.[0]).toMatchObject({ adoptedAgent: "ctf-pwn", previousSessionID: "worker-old" })
      expect(state.runs[0].probes[0]).toMatchObject({ agent: "ctf-pwn", status: "running" })
      expect(state.activeRunID).toBe("run-old")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("rebinds a terminal Team run through the parent adopt path", async () => {
    const directory = makeTestWorkspace("ctf-team-adopt-parent")
    try {
      await seed(directory, "ctf-web")
      const seeded = await readTeamState(directory)
      await writeFile(
        path.join(directory, ".ctf-team.json"),
        JSON.stringify({
          schemaVersion: 2,
          revision: 1,
          updatedAt: "2026-08-03T00:00:00.000Z",
          runs: [
            {
              ...seeded.runs[0],
              parentSessionID: "parent-old",
              status: "ready_for_synthesis",
              jobs: [{ ...seeded.runs[0].jobs[0], status: "completed", sessionID: undefined }],
              probes: [{ ...seeded.runs[0].probes[0], status: "completed" }],
            },
          ],
        }),
        "utf8",
      )
      const baseClient = client()
      const tools = createTeamTools(
        {
          ...baseClient,
          session: {
            ...baseClient.session,
            get: async () => ({ data: null }),
          },
        },
        directory,
      )
      const result = JSON.parse(
        String(
          await tools["ctf-team-adopt"].execute(
            {
              runID: "run-old",
              reason: "rebind surviving Team state",
            },
            { agent: "ctf-expert", sessionID: "parent-new", directory } as never,
          ),
        ),
      )
      const state = await readTeamState(directory)
      expect(result).toMatchObject({
        adopted: true,
        runID: "run-old",
        previousParentSessionID: "parent-old",
        parentSessionID: "parent-new",
      })
      expect(state.runs[0].parentSessionID).toBe("parent-new")
      expect(state.runs[0].adoptionHistory?.[0]).toMatchObject({
        previousParentSessionID: "parent-old",
        adoptedBySessionID: "parent-new",
      })
      expect(state.activeRunID).toBe("run-old")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
