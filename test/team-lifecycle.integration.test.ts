import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { getEvidenceDir, getEvidenceRoot } from "../scripts/evidence-helper.ts"
import { evaluateExpertToolPolicy, loadExpertPolicySnapshot } from "../src/expert-policy.ts"
import { createTeamTools, handleTeamEvent, initializeTeamRuntime, readTeamState, updateTeamState } from "../src/team-runtime.ts"

async function makeEvidenceFixture(directory: string) {
  const slug = "web-team-lifecycle"
  const evidenceDir = getEvidenceDir(directory, slug)
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(path.join(getEvidenceRoot(directory), ".current"), `${slug}\n`, "utf8")
  await writeFile(
    path.join(evidenceDir, ".ctf-evidence-board.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        routes: [
          { id: "R1", state: "open" },
          { id: "R2", state: "open" },
          { id: "R3", state: "open" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  )
}

function fakeTeamClient(
  abortResults: Array<{ error?: string }> = [],
  failureOptions: { failCreateCalls?: number[]; failPromptCalls?: number[]; delayStatusMs?: number } = {},
) {
  const abortQueue = [...abortResults]
  let counter = 0
  let createCalls = 0
  let promptCalls = 0
  const statuses: Record<string, { type: string }> = {}
  const messages: Record<string, unknown> = {}
  const client = {
    session: {
      create: vi.fn(async () => {
        createCalls++
        if (failureOptions.failCreateCalls?.includes(createCalls)) {
          return { error: `session.create failure on call ${createCalls}` }
        }
        const id = `worker-session-${++counter}`
        statuses[id] = { type: "running" }
        messages[id] = [
          {
            info: { role: "assistant" },
            parts: [{ type: "text", text: `STATUS: completed\nFINDINGS: finding from ${id}` }],
          },
        ]
        return { data: { id } }
      }),
      promptAsync: vi.fn(
        async (_request: { path?: { id?: string } } = {}): Promise<{ data?: object; error?: unknown }> => {
          promptCalls++
          if (failureOptions.failPromptCalls?.includes(promptCalls)) {
            return { error: `promptAsync failure on call ${promptCalls}` }
          }
          return { data: {} }
        },
      ),
      status: vi.fn(async () => {
        if (failureOptions.delayStatusMs) {
          await new Promise((resolve) => setTimeout(resolve, failureOptions.delayStatusMs))
        }
        return { data: statuses }
      }),
      messages: vi.fn(async ({ path: requestPath }: { path: { id: string } }) => ({
        data: messages[requestPath.id] ?? [],
      })),
      abort: vi.fn(async () => abortQueue.shift() ?? { data: {} }),
    },
    mcp: {
      add: vi.fn(async () => ({ data: {} })),
      connect: vi.fn(async () => ({ data: {} })),
    },
  }
  return { client, statuses }
}

describe("Team Mode lifecycle integration", () => {
  it("enforces Expert gates across dispatch, synthesis, collect, and close", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "initial parallel wave",
      jobs: [
        {
          title: "web route",
          objective: "inspect the web surface",
          agent: "ctf-web",
          routeId: "R1",
          concurrency: "independent",
        },
        {
          title: "pwn route",
          objective: "inspect the binary surface",
          agent: "ctf-pwn",
          routeId: "R2",
          concurrency: "independent",
        },
      ],
    } as const

    const before = await loadExpertPolicySnapshot(directory, parentSessionID)
    expect(evaluateExpertToolPolicy(before, "bash").allowed).toBe(false)
    expect(evaluateExpertToolPolicy(before, "ctf-team-dispatch", args).allowed).toBe(true)

    const dispatched = await tools["ctf-team-dispatch"].execute(args, {
      agent: "ctf-expert",
      sessionID: parentSessionID,
    } as any)
    expect(String((dispatched as { output?: string }).output)).toContain("status: running")
    const promptCalls = client.session.promptAsync.mock.calls as unknown as Array<
      [{ body?: { tools?: Record<string, boolean> } }]
    >
    for (const [request] of promptCalls) {
      const workerTools = request.body?.tools ?? {}
      for (const toolName of [
        "ctf-team-dispatch",
        "ctf-team-status",
        "ctf-team-collect",
        "ctf-team-cancel",
        "ctf-team-cancel-route",
        "ctf-team-close",
        "ctf-team-recover",
        "ctf-team-adopt",
        "ctf-team-mode",
      ]) {
        expect(workerTools[toolName], `${toolName} must be hidden from workers`).toBe(false)
      }
    }

    let state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.status).toBe("running")
    expect(run.jobs).toHaveLength(2)
    expect(run.jobs.every((job) => job.sessionID)).toBe(true)

    const running = await loadExpertPolicySnapshot(directory, parentSessionID)
    expect(running.teamRunStatus).toBe("running")
    expect(evaluateExpertToolPolicy(running, "bash").allowed).toBe(false)
    expect(evaluateExpertToolPolicy(running, "ctf-team-status").allowed).toBe(true)
    expect(evaluateExpertToolPolicy(running, "ctf-team-recover").allowed).toBe(true)
    expect(evaluateExpertToolPolicy(running, "ctf-team-adopt").allowed).toBe(true)

    for (const job of run.jobs) statuses[job.sessionID!] = { type: "idle" }
    const collected = await tools["ctf-team-collect"].execute({ runID: run.id }, {
      agent: "ctf-expert",
      sessionID: parentSessionID,
    } as any)
    expect(String(collected)).toContain("ready_for_synthesis")

    state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    const ready = await loadExpertPolicySnapshot(directory, parentSessionID)
    expect(ready.teamRunStatus).toBe("ready_for_synthesis")
    expect(evaluateExpertToolPolicy(ready, "bash").allowed).toBe(false)
    expect(evaluateExpertToolPolicy(ready, "ctf-team-collect").allowed).toBe(true)

    const closed = await tools["ctf-team-close"].execute(
      { runID: run.id, outcome: "continue", summary: "No flag; continue with a second wave." },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    expect(String(closed)).toContain("status: completed")

    state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("completed")
    expect(state.runs[0].outcome).toBe("continue")
    const completed = await loadExpertPolicySnapshot(directory, parentSessionID)
    expect(completed.teamRunStatus).toBe("completed")
    expect(evaluateExpertToolPolicy(completed, "bash").allowed).toBe(true)
    expect(evaluateExpertToolPolicy(completed, "ctf-team-dispatch", args).allowed).toBe(true)

    await expect(readFile(path.join(directory, ".ctf-team.json"), "utf8")).resolves.toContain(run.id)
  }, 30_000)

  it("cancels a wave and releases the Expert investigation gate", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-cancel-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "cancel success wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const before = await readTeamState(directory)
    const runID = before.runs[0].id

    await tools["ctf-team-cancel"].execute(
      { runID, reason: "route became irrelevant" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("cancelled")
    expect(state.activeRunID).toBeUndefined()
    expect(state.runs[0].jobs.every((job) => job.status === "cancelled")).toBe(true)
    const policy = await loadExpertPolicySnapshot(directory, parentSessionID)
    expect(evaluateExpertToolPolicy(policy, "bash").allowed).toBe(true)
  }, 30_000)

  it("fails closed on abort failure and recovers before close", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-cancel-recover-session"
    const { client } = fakeTeamClient([{ error: "worker refused abort" }, {}])
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "cancel failure wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const before = await readTeamState(directory)
    const runID = before.runs[0].id
    await tools["ctf-team-cancel"].execute(
      { runID, reason: "abort test" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    let state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("degraded")
    expect(state.runs[0].jobs.some((job) => job.status === "cancel_failed")).toBe(true)
    await expect(
      tools["ctf-team-close"].execute(
        { runID, outcome: "blocked", summary: "must not close while cancellation is uncertain" },
        { agent: "ctf-expert", sessionID: parentSessionID } as any,
      ),
    ).rejects.toThrow("cancel_failed")

    await tools["ctf-team-recover"].execute(
      { runID },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("cancelled")
    expect(state.runs[0].jobs.every((job) => job.status === "cancelled")).toBe(true)
    expect(state.activeRunID).toBeUndefined()
  }, 30_000)

  it("enforces an expired worker deadline and records a bounded abort outcome", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-deadline-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "deadline wave",
      timeoutMinutes: 1,
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const initial = await readTeamState(directory)
    const initialSessionIDs = initial.runs[0].jobs.map((job) => job.sessionID)
    await updateTeamState(directory, (state) => {
      for (const job of state.runs[0].jobs) job.deadlineAt = "2026-08-01T00:00:00.000Z"
    })

    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    let state = await readTeamState(directory)
    let run = state.runs[0]
    expect(run.status).toBe("running")
    expect(run.jobs.every((job, index) => job.status === "running" && job.sessionID !== initialSessionIDs[index])).toBe(true)
    expect(run.jobs.every((job) => job.attempt === 1 && job.deadlineAt)).toBe(true)
    expect(client.session.abort).toHaveBeenCalledTimes(2)

    // A second deadline consumes the retry budget and closes each job as failed.
    await updateTeamState(directory, (draft) => {
      for (const job of draft.runs[0].jobs) job.deadlineAt = "2026-08-01T00:00:00.000Z"
    })
    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    run = state.runs[0]
    expect(run.status).toBe("degraded")
    expect(run.jobs.every((job) => job.status === "failed")).toBe(true)
    expect(run.jobs.every((job) => job.abortRequestedAt && job.abortSucceededAt)).toBe(true)
    expect(run.jobs.every((job) => job.error?.includes("deadline exceeded"))).toBe(true)
    expect(run.notificationSentAt).toBeDefined()
    expect(client.session.abort).toHaveBeenCalledTimes(4)
  }, 30_000)

  it("claims a deadline retry once when recovery is invoked concurrently", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-concurrent-retry-session"
    const { client } = fakeTeamClient([], { delayStatusMs: 50 })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "concurrent retry wave",
      timeoutMinutes: 1,
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const initial = await readTeamState(directory)
    const initialSessionIDs = initial.runs[0].jobs.map((job) => job.sessionID)
    await updateTeamState(directory, (state) => {
      for (const job of state.runs[0].jobs) job.deadlineAt = "2026-08-01T00:00:00.000Z"
    })

    await Promise.all([
      tools["ctf-team-recover"].execute({}, { agent: "ctf-expert", sessionID: parentSessionID } as any),
      tools["ctf-team-recover"].execute({}, { agent: "ctf-expert", sessionID: parentSessionID } as any),
    ])

    const state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.jobs.every((job, index) => job.status === "running" && job.attempt === 1 && job.sessionID !== initialSessionIDs[index])).toBe(true)
    expect(new Set(run.jobs.map((job) => job.sessionID)).size).toBe(2)
    expect(run.jobs.every((job) => !job.retryPending && !job.retrySessionID)).toBe(true)
    expect(client.session.create).toHaveBeenCalledTimes(4)
    expect(client.session.abort).toHaveBeenCalledTimes(2)
  }, 30_000)

  it("aborts pending replacement workers during runtime restart recovery", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-pending-retry-restart-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "pending retry restart wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      for (const [index, job] of state.runs[0].jobs.entries()) {
        job.status = "retrying"
        job.retryPending = true
        job.retrySessionID = `replacement-restart-session-${index + 1}`
        job.deadlineAt = undefined
        job.lastHeartbeatAt = undefined
      }
      state.runs[0].status = "running"
    })

    await initializeTeamRuntime(client, directory, directory)

    const state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.status).toBe("degraded")
    expect(run.jobs.every((job) => job.status === "failed" && !job.retryPending && !job.retrySessionID)).toBe(true)
    expect(client.session.abort).toHaveBeenCalledTimes(2)
    const abortCalls = client.session.abort.mock.calls as unknown as Array<[{ path: { id: string } }]>
    expect(abortCalls.map(([request]) => request.path.id)).toEqual([
      "replacement-restart-session-1",
      "replacement-restart-session-2",
    ])
  }, 30_000)

  it("fails closed when restart recovery cannot abort a pending replacement", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-pending-retry-abort-failure-session"
    const { client } = fakeTeamClient([
      { error: "replacement one is still alive" },
      { error: "replacement two is still alive" },
    ])
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "pending retry abort failure wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      for (const [index, job] of state.runs[0].jobs.entries()) {
        job.status = "retrying"
        job.retryPending = true
        job.retrySessionID = `replacement-abort-failure-session-${index + 1}`
        job.deadlineAt = undefined
        job.lastHeartbeatAt = undefined
      }
      state.runs[0].status = "running"
    })

    await initializeTeamRuntime(client, directory, directory)

    const state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.status).toBe("degraded")
    expect(run.jobs.every((job) => job.status === "cancel_failed" && !job.retryPending && !job.retrySessionID)).toBe(true)
    expect(run.jobs.every((job) => job.error?.includes("pending replacement"))).toBe(true)
    expect(client.session.abort).toHaveBeenCalledTimes(2)
  }, 30_000)

  it("fails closed when a replacement worker cannot start and cleanup also fails", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-retry-start-failure-session"
    const { client } = fakeTeamClient([{}, { error: "replacement cleanup refused" }, {}], { failPromptCalls: [3] })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "replacement startup failure wave",
      timeoutMinutes: 1,
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      for (const job of state.runs[0].jobs) job.deadlineAt = "2026-08-01T00:00:00.000Z"
    })

    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    const run = state.runs[0]
    const failedCleanup = run.jobs.find((job) => job.routeId === "R1")!
    const retried = run.jobs.find((job) => job.routeId === "R2")!
    expect(run.status).toBe("degraded")
    expect(failedCleanup.status).toBe("cancel_failed")
    expect(failedCleanup.error).toContain("replacement abort failed")
    expect(failedCleanup.retryPending).toBe(false)
    expect(failedCleanup.retrySessionID).toBeUndefined()
    expect(retried.status).toBe("running")
    expect(retried.attempt).toBe(1)
    expect(retried.sessionID).not.toBeUndefined()
    expect(client.session.abort).toHaveBeenCalledTimes(3)
  }, 30_000)

  it("fails closed when replacement session creation is rejected", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-retry-create-failure-session"
    const { client } = fakeTeamClient([{}, {}, {}], { failCreateCalls: [3, 4] })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const args = {
      title: "replacement create failure wave",
      timeoutMinutes: 1,
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      for (const job of state.runs[0].jobs) job.deadlineAt = "2026-08-01T00:00:00.000Z"
    })

    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.status).toBe("degraded")
    expect(run.jobs.every((job) => job.status === "failed")).toBe(true)
    expect(run.jobs.every((job) => !job.retryPending && !job.retrySessionID)).toBe(true)
    expect(run.jobs.every((job) => job.error?.includes("Deadline retry worker failed to start"))).toBe(true)
    expect(client.session.abort).toHaveBeenCalledTimes(2)
  }, 30_000)

  it("recovers an active wave after a simulated plugin restart", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-restart-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "restart recovery wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const dispatched = await readTeamState(directory)
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }

    await initializeTeamRuntime(client, directory, directory)

    const state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    expect(state.runs[0].jobs.every((job) => job.status === "completed")).toBe(true)
    expect(state.runs[0].notificationSentAt).toBeDefined()
  }, 30_000)

  it("aborts workers when the parent session is deleted", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-deleted-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "parent deletion cleanup wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    client.session.promptAsync.mockClear()

    await handleTeamEvent(
      { type: "session.deleted", properties: { info: { id: parentSessionID } } },
      client,
      directory,
      directory,
    )

    const state = await readTeamState(directory)
    expect(client.session.abort).toHaveBeenCalledTimes(2)
    expect(state.runs[0].status).toBe("cancelled")
    expect(state.runs[0].jobs.every((job) => job.status === "cancelled")).toBe(true)
    expect(state.activeRunID).toBeUndefined()
    expect(client.session.promptAsync).not.toHaveBeenCalled()
  }, 30_000)
  it("preserves completed worker evidence when the parent disappears before synthesis", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-ready-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "parent deletion after collection",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const dispatched = await readTeamState(directory)
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute(
      { runID: dispatched.runs[0].id },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    client.session.abort.mockClear()

    await handleTeamEvent(
      { type: "session.deleted", properties: { info: { id: parentSessionID } } },
      client,
      directory,
      directory,
    )

    const state = await readTeamState(directory)
    expect(client.session.abort).not.toHaveBeenCalled()
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    expect(state.runs[0].jobs.every((job) => job.status === "completed")).toBe(true)
  }, 30_000)
  it("explicitly adopts a ready run after the original parent is gone", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const oldParentSessionID = "expert-adoption-old-parent"
    const newParentSessionID = "expert-adoption-new-parent"
    const { client, statuses } = fakeTeamClient()
    Object.assign(client.session, {
      get: vi.fn(async ({ path: requestPath }: any) =>
        requestPath?.id === oldParentSessionID ? { error: "404 session not found" } : { data: { id: requestPath?.id } },
      ),
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "adoptable parent wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: oldParentSessionID } as any)
    const dispatched = await readTeamState(directory)
    const runID = dispatched.runs[0].id
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, { agent: "ctf-expert", sessionID: oldParentSessionID } as any)

    const adopted = await tools["ctf-team-adopt"].execute(
      { runID, reason: "The original OpenCode parent was deleted before synthesis." },
      { agent: "ctf-expert", sessionID: newParentSessionID } as any,
    )
    expect(String(adopted)).toContain('"adopted": true')

    const state = await readTeamState(directory)
    expect(state.runs[0].parentSessionID).toBe(newParentSessionID)
    expect(state.runs[0].adoptionHistory).toHaveLength(1)
    expect(state.runs[0].adoptionHistory?.[0].previousParentSessionID).toBe(oldParentSessionID)
    expect(state.runs[0].adoptionHistory?.[0].adoptedBySessionID).toBe(newParentSessionID)
    expect(state.activeRunID).toBe(runID)
    expect((await loadExpertPolicySnapshot(directory, newParentSessionID)).teamRunStatus).toBe("ready_for_synthesis")
    expect((await loadExpertPolicySnapshot(directory, oldParentSessionID)).teamRunIds).toEqual([])
  }, 30_000)

  it("refuses adoption while the original parent still exists", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const oldParentSessionID = "expert-adoption-live-parent"
    const newParentSessionID = "expert-adoption-rejected-parent"
    const { client, statuses } = fakeTeamClient()
    Object.assign(client.session, {
      get: vi.fn(async () => ({ data: { id: oldParentSessionID } })),
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "non-adoptable parent wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: oldParentSessionID } as any)
    const dispatched = await readTeamState(directory)
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute(
      { runID: dispatched.runs[0].id },
      { agent: "ctf-expert", sessionID: oldParentSessionID } as any,
    )

    await expect(
      tools["ctf-team-adopt"].execute(
        { runID: dispatched.runs[0].id, reason: "test" },
        { agent: "ctf-expert", sessionID: newParentSessionID } as any,
      ),
    ).rejects.toThrow("original parent session still exists")
  }, 30_000)

  it("refuses adoption when persisted run status is not synthesis-ready", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const oldParentSessionID = "expert-adoption-stale-old-parent"
    const newParentSessionID = "expert-adoption-stale-new-parent"
    const { client, statuses } = fakeTeamClient()
    Object.assign(client.session, {
      get: vi.fn(async () => ({ error: "404 session not found" })),
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "stale status adoption wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: oldParentSessionID } as any)
    const dispatched = await readTeamState(directory)
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute(
      { runID: dispatched.runs[0].id },
      { agent: "ctf-expert", sessionID: oldParentSessionID } as any,
    )
    await updateTeamState(directory, (state) => {
      state.runs[0].status = "running"
    })

    await expect(
      tools["ctf-team-adopt"].execute(
        { runID: dispatched.runs[0].id, reason: "test stale status" },
        { agent: "ctf-expert", sessionID: newParentSessionID } as any,
      ),
    ).rejects.toThrow("only ready_for_synthesis or degraded runs are adoptable")
  }, 30_000)

  it("keeps notification pending when the parent is gone, then retries delivery", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-notification-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "notification retry wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const dispatched = await readTeamState(directory)
    for (const job of dispatched.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    client.session.promptAsync.mockImplementation(
      async ({ path: requestPath }: { path?: { id?: string } } = {}) =>
        requestPath?.id === parentSessionID ? { error: "parent session is gone" } : { data: {} },
    )

    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    let state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    expect(state.runs[0].notificationPending).toBe(true)
    expect(state.runs[0].notificationSentAt).toBeUndefined()
    expect(state.runs[0].notificationError).toContain("parent session is gone")

    client.session.promptAsync.mockImplementation(async () => ({ data: {} }))
    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    expect(state.runs[0].notificationPending).toBe(false)
    expect(state.runs[0].notificationSentAt).toBeDefined()
    expect(state.runs[0].notificationError).toBeUndefined()
  }, 30_000)

  it("ignores stale worker events after cancellation", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-stale-event-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "stale event wave",
      jobs: [
        { title: "R1", objective: "inspect route one", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "inspect route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const dispatched = await readTeamState(directory)
    const runID = dispatched.runs[0].id
    const workerSessionID = dispatched.runs[0].jobs[0].sessionID!
    await tools["ctf-team-cancel"].execute(
      { runID, reason: "stale event test" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    await handleTeamEvent(
      { type: "session.status", properties: { sessionID: workerSessionID, status: { type: "running" } } },
      client,
      directory,
      directory,
    )

    const state = await readTeamState(directory)
    expect(state.runs[0].jobs[0].status).toBe("cancelled")
  }, 30_000)

  it("aborts a replacement session when full cancellation races deadline retry", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-cancel-retry-race-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 1, maxJobAttempts: 2 })
    const args = {
      title: "cancel retry race wave",
      timeoutMinutes: 1,
      jobs: [{ title: "R1", objective: "race cancellation with retry", agent: "ctf-web", routeId: "R1", concurrency: "independent" }],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      state.runs[0].jobs[0].deadlineAt = "2026-08-01T00:00:00.000Z"
    })
    const before = await readTeamState(directory)
    const runID = before.runs[0].id
    const oldSessionID = before.runs[0].jobs[0].sessionID!
    const abortedSessionIDs: string[] = []
    let abortCalls = 0
    let releaseInitialAbort!: () => void
    let initialAbortStarted!: () => void
    const initialAbortReleased = new Promise<void>((resolve) => {
      releaseInitialAbort = resolve
    })
    const initialAbortStartedPromise = new Promise<void>((resolve) => {
      initialAbortStarted = resolve
    })
    let releaseReplacementPrompt!: () => void
    let replacementPromptStarted!: () => void
    const replacementPromptReleased = new Promise<void>((resolve) => {
      releaseReplacementPrompt = resolve
    })
    const replacementPromptStartedPromise = new Promise<void>((resolve) => {
      replacementPromptStarted = resolve
    })
    client.session.promptAsync.mockImplementation(async () => {
      replacementPromptStarted()
      await replacementPromptReleased
      return { data: {} }
    })
    client.session.abort.mockImplementation(async ({ path: requestPath }: any = {}) => {
      abortCalls++
      abortedSessionIDs.push(requestPath?.id ?? "")
      if (abortCalls === 1) {
        initialAbortStarted()
        await initialAbortReleased
      }
      return { data: {} }
    })

    const cancellation = tools["ctf-team-cancel"].execute(
      { runID, reason: "replacement race cancellation" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    await initialAbortStartedPromise

    const recovery = tools["ctf-team-recover"].execute(
      { runID },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    await replacementPromptStartedPromise
    const retried = await waitForTeamState(directory, (state) => Boolean(state.runs[0].jobs[0].retrySessionID))
    const replacementSessionID = retried.runs[0].jobs[0].retrySessionID!
    releaseInitialAbort()
    await cancellation
    releaseReplacementPrompt()
    await recovery

    const state = await readTeamState(directory)
    const job = state.runs[0].jobs[0]
    expect(state.runs[0].status).toBe("cancelled")
    expect(job.status).toBe("cancelled")
    expect(job.retryPending).toBe(false)
    expect(job.retrySessionID).toBeUndefined()
    expect(abortedSessionIDs.slice(0, 3)).toEqual([oldSessionID, oldSessionID, replacementSessionID])
    expect(abortedSessionIDs.filter((sessionID) => sessionID === replacementSessionID).length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it("fails closed when the raced replacement session refuses follow-up abort", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-cancel-retry-race-failure-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 1, maxJobAttempts: 2 })
    const args = {
      title: "cancel retry race failure wave",
      timeoutMinutes: 1,
      jobs: [{ title: "R1", objective: "race cancellation with retry failure", agent: "ctf-web", routeId: "R1", concurrency: "independent" }],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    await updateTeamState(directory, (state) => {
      state.runs[0].jobs[0].deadlineAt = "2026-08-01T00:00:00.000Z"
    })
    const before = await readTeamState(directory)
    const runID = before.runs[0].id
    const oldSessionID = before.runs[0].jobs[0].sessionID!
    let abortCalls = 0
    let releaseInitialAbort!: () => void
    let initialAbortStarted!: () => void
    const initialAbortReleased = new Promise<void>((resolve) => {
      releaseInitialAbort = resolve
    })
    const initialAbortStartedPromise = new Promise<void>((resolve) => {
      initialAbortStarted = resolve
    })
    let releaseReplacementPrompt!: () => void
    let replacementPromptStarted!: () => void
    const replacementPromptReleased = new Promise<void>((resolve) => {
      releaseReplacementPrompt = resolve
    })
    const replacementPromptStartedPromise = new Promise<void>((resolve) => {
      replacementPromptStarted = resolve
    })
    client.session.promptAsync.mockImplementation(async () => {
      replacementPromptStarted()
      await replacementPromptReleased
      return { data: {} }
    })
    client.session.abort.mockImplementation(async ({ path: requestPath }: any = {}) => {
      abortCalls++
      if (abortCalls === 1) {
        initialAbortStarted()
        await initialAbortReleased
      }
      if (abortCalls === 3 && requestPath?.id !== oldSessionID) {
        return { error: "replacement refused follow-up abort" }
      }
      return { data: {} }
    })

    const cancellation = tools["ctf-team-cancel"].execute(
      { runID, reason: "replacement race failure" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    await initialAbortStartedPromise
    const recovery = tools["ctf-team-recover"].execute(
      { runID },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    await replacementPromptStartedPromise
    await waitForTeamState(directory, (state) => Boolean(state.runs[0].jobs[0].retrySessionID))
    releaseInitialAbort()
    await cancellation
    releaseReplacementPrompt()
    await recovery

    const state = await readTeamState(directory)
    const job = state.runs[0].jobs[0]
    expect(state.runs[0].status).toBe("degraded")
    expect(job.status).toBe("cancel_failed")
    expect(job.error).toContain("replacement abort failed")
    expect(job.retryPending).toBe(false)
    expect(job.retrySessionID).toBeUndefined()
  }, 30_000)

  it("cancels only non-kept routes and allows the kept route to finish", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-cancel-route-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 3, maxJobAttempts: 1 })
    const args = {
      title: "cancel route wave",
      jobs: [
        { title: "R1", objective: "keep live route", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "R2", objective: "discard route two", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        { title: "R3", objective: "discard route three", agent: "ctf-rev", routeId: "R3", concurrency: "independent" },
      ],
    } as const

    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    let state = await readTeamState(directory)
    const runID = state.runs[0].id
    const keptSessionID = state.runs[0].jobs.find((job) => job.routeId === "R1")!.sessionID!

    await tools["ctf-team-cancel-route"].execute(
      { runID, keepRouteId: "R1" },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    expect(state.runs[0].jobs.find((job) => job.routeId === "R1")?.status).toBe("running")
    expect(state.runs[0].jobs.filter((job) => job.routeId !== "R1").every((job) => job.status === "cancelled")).toBe(true)

    statuses[keptSessionID] = { type: "idle" }
    await tools["ctf-team-collect"].execute(
      { runID },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    expect(state.runs[0].status).toBe("ready_for_synthesis")
    expect(state.runs[0].jobs.find((job) => job.routeId === "R1")?.status).toBe("completed")
  }, 30_000)
})

async function waitForTeamState(
  directory: string,
  predicate: (state: Awaited<ReturnType<typeof readTeamState>>) => boolean,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await readTeamState(directory)
    if (predicate(state)) return state
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for Team state predicate.")
}

async function fsTempDirectory() {
  const { mkdtemp } = await import("node:fs/promises")
  return mkdtemp(path.join(os.tmpdir(), "ctf-team-lifecycle-"))
}
