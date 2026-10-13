import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin"
import { describe, expect, it, vi } from "vitest"
import { getEvidenceDir, getEvidenceRoot } from "../scripts/evidence-helper.ts"
import { evaluateExpertToolPolicy, loadExpertPolicySnapshot } from "../src/expert-policy.ts"
import { listCaseEvents } from "../src/case-state.ts"
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

/**
 * Minimal ToolContext stand-in for driving Team tools in tests. The plugin
 * ToolContext requires host-owned fields (messageID, abort, metadata) that the
 * runtime never reads, so they are filled with inert values rather than a cast.
 */
function toolContext(sessionID: string, agent = "ctf-expert"): ToolContext {
  return {
    sessionID,
    messageID: "",
    agent,
    directory: "",
    worktree: "",
    abort: new AbortController().signal,
    metadata: async () => {},
    ask: async () => {},
  }
}

function fakeTeamClient(
  abortResults: Array<{ error?: string }> = [],
  failureOptions: {
    failCreateCalls?: number[]
    invalidCreateCalls?: number[]
    failPromptCalls?: number[]
    failAbortCalls?: number[]
    delayStatusMs?: number
    parentMessages?: Record<string, unknown[]>
    /** Final assistant text per session.create call index (1-based). */
    workerTexts?: Record<number, string>
  } = {},
) {
  const abortQueue = [...abortResults]
  let counter = 0
  let createCalls = 0
  let promptCalls = 0
  let abortCalls = 0
  const statuses: Record<string, { type: string }> = {}
  const messages: Record<string, unknown> = {}
  const client = {
    session: {
      create: vi.fn(async () => {
        createCalls++
        if (failureOptions.failCreateCalls?.includes(createCalls)) {
          return { error: `session.create failure on call ${createCalls}` }
        }
        if (failureOptions.invalidCreateCalls?.includes(createCalls)) {
          return { data: {} }
        }
        const id = `worker-session-${++counter}`
        statuses[id] = { type: "running" }
        messages[id] = [
          {
            info: { role: "assistant" },
            parts: [
              {
                type: "text",
                text:
                  failureOptions.workerTexts?.[createCalls] ??
                  `STATUS: completed\nFINDINGS: finding from ${id}`,
              },
            ],
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
        data:
          failureOptions.parentMessages?.[requestPath.id] ??
          messages[requestPath.id] ??
          (requestPath.id.startsWith("worker-session-")
            ? []
            : [{ info: { role: "assistant", providerID: "test-provider", modelID: "test-model" }, parts: [] }]),
      })),
      get: vi.fn(async ({ path: requestPath }: { path: { id: string } }) => ({ data: { id: requestPath.id } })), 
      abort: vi.fn(async () => {
        abortCalls++
        if (failureOptions.failAbortCalls?.includes(abortCalls)) return { error: `abort failure on call ${abortCalls}` }
        return abortQueue.shift() ?? { data: {} }
      }),
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
    for (const [request] of promptCalls) {
      const workerTools = request.body?.tools ?? {}
      for (const toolName of ["bash", "shell", "powershell", "cmd", "edit", "write", "apply_patch", "ctf-python-inline", "ctf-python-parallel", "ctf-background-job", "ctf-pwn-runner", "ctf-pwn-docker-runner", "ctf-windows-debug-helper", "ctf-rev-live-memory-dump"]) {
        expect(workerTools[toolName] ?? false, `${toolName} must not be exposed to workers`).toBe(false)
      }
      for (const toolName of ["read", "glob", "grep", "skill"]) {
        expect(workerTools[toolName], `${toolName} must be exposed to workers`).toBe(true)
      }
    }
    const claimEnabledPrompts = promptCalls.filter(([request]) => request.body?.tools?.["ctf-team-claim"] === true)
    expect(claimEnabledPrompts.length).toBe(promptCalls.length)
    expect(promptCalls.length).toBeGreaterThan(0)

    let state = await readTeamState(directory)
    const run = state.runs[0]
    expect(run.intents).toHaveLength(2)
    expect(run.intents?.every((intent) => intent.status === "running")).toBe(true)
    expect(run.jobs.every((job) => job.intentId && run.intents?.some((intent) => intent.id === job.intentId))).toBe(true)
    expect(run.intents?.map((intent) => intent.routeId)).toEqual(["R1", "R2"])
    expect(run.intents?.every((intent) => intent.claimToken)).toBe(true)
    expect(run.intents?.every((intent) => intent.claimedBy && run.jobs.some((job) => job.id === intent.claimedBy))).toBe(true)
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
    expect(state.runs[0].intents?.every((intent) => intent.status === "completed")).toBe(true)
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

  it("collects structured fact packets, consumes intent_result, and audits case events", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-fact-session"
    const factPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R1",
      statement: "Login endpoint reflects username in error page.",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "response", value: "Invalid login: admin" }],
    })
    const resultPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "intent_result",
      status: "completed",
      summary: "Confirmed reflected input on login error surface.",
      artifacts: ["work/login-probe.txt"],
    })
    const { client, statuses } = fakeTeamClient([], {
      workerTexts: {
        1: `Analysis done.\n\n\`\`\`json\n${factPacket}\n\`\`\`\`\n\n\`\`\`json\n${resultPacket}\n\`\`\``,
      },
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "fact collection wave",
      jobs: [
        { title: "web route", objective: "probe login surface", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "pwn route", objective: "inspect binary", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const
    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    let state = await readTeamState(directory)
    const run = state.runs[0]
    for (const job of run.jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: run.id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)

    state = await readTeamState(directory)
    const facts = state.runs[0].facts ?? []
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ status: "pending", routeId: "R1", confidence: "observed" })
    expect(facts[0].sourceSessionId).toBe(state.runs[0].jobs[0].sessionID)
    const webIntent = state.runs[0].intents?.find((intent) => intent.routeId === "R1")
    expect(webIntent?.resultSummary).toBe("Confirmed reflected input on login error surface.")
    expect(webIntent?.resultArtifacts).toEqual(["work/login-probe.txt"])

    const events = await listCaseEvents(directory, "web-team-lifecycle")
    const types = events.map((event) => event.type)
    expect(types).toContain("team.fact_submitted")
    expect(types).toContain("team.intent_completed")
    expect(types).toContain("team.intent_created")

    await tools["ctf-team-facts"].execute(
      { action: "accept", runID: run.id, factID: facts[0].id },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    state = await readTeamState(directory)
    expect(state.runs[0].facts?.[0]).toMatchObject({ status: "accepted", confidence: "confirmed" })
    const reviewedEvents = await listCaseEvents(directory, "web-team-lifecycle")
    expect(reviewedEvents.map((event) => event.type)).toContain("team.fact_accepted")
  }, 30_000)

  it("drops cross-route fact packets and rejects unaccepted intent basis", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-provenance-session"
    const crossRoutePacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R2",
      statement: "Claim about another route.",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "curl http://target" }],
    })
    const { client, statuses } = fakeTeamClient([], { workerTexts: { 1: `\`\`\`json\n${crossRoutePacket}\n\`\`\`` } })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "provenance wave",
      jobs: [
        { title: "web route", objective: "probe login surface", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "pwn route", objective: "inspect binary", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const
    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const state0 = await readTeamState(directory)
    for (const job of state0.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: state0.runs[0].id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    expect((await readTeamState(directory)).runs[0].facts ?? []).toHaveLength(0)

    // Unaccepted fact basis must be rejected for follow-up intents.
    const pendingFactID = "fact-not-accepted"
    await expect(
      tools["ctf-team-intent"].execute(
        {
          action: "create",
          title: "verify reflected input",
          objective: "confirm reflection via payload encoding",
          routeId: "R1",
          basedOnFactIds: [pendingFactID],
          stopCondition: "reflection confirmed or ruled out",
        },
        { agent: "ctf-expert", sessionID: parentSessionID } as any,
      ),
    ).rejects.toThrow(/not found|must be accepted/)
  }, 30_000)

  it("creates an intent from accepted facts and claims it onto a fresh worker", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-claim-session"
    const factPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R1",
      statement: "Target serves /admin with 403 and X-Admin header hint.",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "response", value: "HTTP/1.1 403; X-Admin: beta" }],
    })
    const { client, statuses } = fakeTeamClient([], { workerTexts: { 1: `\`\`\`json\n${factPacket}\n\`\`\`\`` } })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const args = {
      title: "claim seed wave",
      jobs: [
        { title: "web route", objective: "probe admin surface", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "pwn route", objective: "inspect binary", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    } as const
    await tools["ctf-team-dispatch"].execute(args, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    let state = await readTeamState(directory)
    for (const job of state.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: state.runs[0].id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    const factID = state.runs[0].facts?.[0]?.id
    expect(factID).toBeTruthy()

    await tools["ctf-team-facts"].execute(
      { action: "accept", runID: state.runs[0].id, factID: factID! },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    const created = await tools["ctf-team-intent"].execute(
      {
        action: "create",
        title: "verify admin header path",
        objective: "test X-Admin bypass variants",
        routeId: "R1",
        basedOnFactIds: [factID!],
        expectedObservation: "200 response on /admin",
        stopCondition: "confirmed admin access or exhausted bypass list",
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    const intentID = JSON.parse(String(created)).intentID as string
    expect(intentID).toBeTruthy()

    const claimed = JSON.parse(
      String(
        await tools["ctf-team-intent"].execute(
          { action: "claim-next", agent: "ctf-web", runID: state.runs[0].id },
          { agent: "ctf-expert", sessionID: parentSessionID } as any,
        ),
      ),
    )
    expect(claimed.ok).toBe(true)
    expect(claimed.intentID).toBe(intentID)

    state = await readTeamState(directory)
    const claimedIntent = state.runs[0].intents?.find((intent) => intent.id === intentID)
    expect(claimedIntent?.status).toBe("running")
    const claimedJob = state.runs[0].jobs.find((job) => job.intentId === intentID)
    expect(claimedJob?.sessionID).toBeTruthy()
    expect(claimedIntent?.claimToken).toBe(claimedJob?.ownerToken)
    expect(claimedIntent?.basedOnFactIds).toEqual([factID])

    statuses[claimedJob!.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: state.runs[0].id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    expect(state.runs[0].intents?.find((intent) => intent.id === intentID)?.status).toBe("completed")
    expect(state.runs[0].status).toBe("ready_for_synthesis")

    await tools["ctf-team-close"].execute(
      { runID: state.runs[0].id, outcome: "continue", summary: "Wave closed after claim verification." },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
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
    expect(state.runs[0].intents?.every((intent) => intent.status === "cancelled")).toBe(true)
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
    expect(run.jobs.every((job) => job.errorDetails?.errorType === "heartbeat" && job.errorDetails?.phase === "running")).toBe(true)
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

  it("rejects an unregistered agent before creating a child session", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2 })

    await expect(
      tools["ctf-team-dispatch"].execute(
        {
          title: "registry validation",
          jobs: [
            { title: "bad", objective: "health check", agent: "ctf-does-not-exist", routeId: "R1", concurrency: "independent" },
            { title: "good", objective: "health check", agent: "ctf-web", routeId: "R2", concurrency: "independent" },
          ],
        },
        { agent: "ctf-expert", sessionID: "registry-parent" } as any,
      ),
    ).rejects.toThrow(/UnknownAgentError.*ctf-does-not-exist.*available agents/)
    expect(client.session.create).not.toHaveBeenCalled()
    expect((await readTeamState(directory)).runs).toHaveLength(0)
  })

  it("cleans up a child session when prompt startup fails", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "startup-cleanup-parent"
    const { client } = fakeTeamClient([], { failPromptCalls: [1] })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })

    await tools["ctf-team-dispatch"].execute({
      title: "startup cleanup wave",
      jobs: [
        { title: "web route", objective: "check startup cleanup", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
        { title: "pwn route", objective: "check healthy startup", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
      ],
    }, { agent: "ctf-expert", sessionID: parentSessionID, directory } as never)

    const state = await readTeamState(directory)
    const failed = state.runs[0].jobs.find((job) => job.agent === "ctf-web")!
    expect(client.session.abort).toHaveBeenCalledTimes(1)
    expect(failed.status).toBe("failed")
    expect(failed.errorDetails?.phase).toBe("prompt_injection")
    expect(failed.errorDetails?.message).toContain("promptAsync failure")
  })

  it("persists structured diagnostics when a child returns bare UnknownError", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "structured-error-parent"
    const { client } = fakeTeamClient()
    client.session.promptAsync
      .mockResolvedValueOnce({ error: { name: "UnknownError" } })
      .mockResolvedValueOnce({ data: {} })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2 })

    await tools["ctf-team-dispatch"].execute(
      {
        title: "startup diagnostics",
        jobs: [
          { title: "web startup", objective: "health check", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "pwn startup", objective: "health check", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    const failed = state.runs[0].jobs.find((job) => job.title === "web startup")!
    expect(failed.status).toBe("failed")
    expect(failed.error).not.toBe("UnknownError")
    expect(failed.errorDetails).toMatchObject({
      errorType: "prompt_injection",
      phase: "prompt_injection",
      agent: "ctf-web",
      parentSessionID,
      jobID: failed.id,
      retryable: true,
    })
    expect(failed.errorDetails?.message).toContain("UnknownError")
    expect(failed.errorDetails?.childSessionID).toBe(failed.sessionID)
  })

  it("refuses to create workers when the lead provider/model cannot be resolved", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "missing-model-parent"
    const { client } = fakeTeamClient([], { parentMessages: { [parentSessionID]: [] } })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2 })

    await expect(
      tools["ctf-team-dispatch"].execute(
        {
          title: "strict model requirement",
          jobs: [
            { title: "web health", objective: "health check", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
            { title: "pwn health", objective: "health check", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
          ],
        },
        { agent: "ctf-expert", sessionID: parentSessionID } as any,
      ),
    ).rejects.toThrow(/ParentModelUnavailableError.*no child was created/)
    expect(client.session.create).not.toHaveBeenCalled()
    expect((await readTeamState(directory)).runs).toHaveLength(0)
  })

  it("classifies provider policy blocks and preserves the SDK diagnostic", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "provider-policy-parent"
    const { client } = fakeTeamClient()
    client.session.promptAsync
      .mockResolvedValueOnce({
        error: {
          name: "UnknownError",
          data: { message: "This content was flagged for possible cybersecurity risk." },
        },
      })
      .mockResolvedValueOnce({ data: {} })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 3 })

    await tools["ctf-team-dispatch"].execute(
      {
        title: "provider policy diagnostics",
        jobs: [
          { title: "web startup", objective: "health check", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "pwn startup", objective: "health check", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    const failed = state.runs[0].jobs.find((job) => job.title === "web startup")!
    expect(failed.status).toBe("failed")
    expect(failed.errorDetails).toMatchObject({
      errorType: "provider_policy",
      phase: "prompt_injection",
      retryable: false,
      parentSessionID,
    })
    expect(failed.errorDetails?.message).toContain("possible cybersecurity risk")
    expect(failed.error).not.toBe("UnknownError")
  })

  it("inherits the parent provider and model when starting child workers", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "model-inheritance-parent"
    const { client } = fakeTeamClient([], {
      parentMessages: {
        [parentSessionID]: [
          {
            info: { role: "assistant", providerID: "apihub", modelID: "gpt-5.6-luna" },
            parts: [],
          },
        ],
      },
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2 })

    await tools["ctf-team-dispatch"].execute(
      {
        title: "model inheritance",
        jobs: [
          { title: "web health", objective: "return a health report", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "pwn health", objective: "return a health report", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const childPrompts = client.session.promptAsync.mock.calls.filter((call: any[]) =>
      String(call[0]?.path?.id ?? "").startsWith("worker-session-"),
    )
    expect(childPrompts).toHaveLength(2)
    for (const call of childPrompts as any[]) {
      expect(call[0]?.body?.model).toEqual({ providerID: "apihub", modelID: "gpt-5.6-luna" })
    }
  })

  it("does not collect an absent child session as a successful result", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "absent-child-parent"
    const { client } = fakeTeamClient()
    client.session.status.mockResolvedValue({ data: {} })
    ;(client.session as any).get = vi.fn(async () => ({ error: { name: "NotFoundError", message: "session not found" } }))
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2 })

    await tools["ctf-team-dispatch"].execute(
      {
        title: "missing child",
        jobs: [
          { title: "web child", objective: "health check", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "pwn child", objective: "health check", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    await tools["ctf-team-recover"].execute(
      {},
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )

    const state = await readTeamState(directory)
    for (const job of state.runs[0].jobs) {
      expect(job.status).toBe("failed")
      expect(job.result).toBeUndefined()
      expect(job.errorDetails?.phase).toBe("running")
      expect(job.errorDetails?.retryable).toBe(true)
    }
  })

  it("lets a verified active worker self-claim the next open intent on its run", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "worker-claim-parent"
    // Only the R2 worker reports a fact; R1 stays running so its session remains an active, claim-eligible worker.
    const factPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R2",
      statement: "Binary prints 'admin-token' on stderr when started.",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "./vuln 2>&1 | grep admin" }],
    })
    const { client, statuses } = fakeTeamClient([], {
      workerTexts: { 1: "STATUS: completed\nFINDINGS: nothing to report", 2: `\`\`\`json\n${factPacket}\n\`\`\`` },
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 3, maxJobAttempts: 1 })
    await tools["ctf-team-dispatch"].execute(
      {
        title: "claim seed",
        jobs: [
          { title: "R1 probe", objective: "inspect login", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "R2 probe", objective: "inspect binary", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    // Mark the R2 worker idle so its fact is collected; R1 stays running.
    let state = await readTeamState(directory)
    const seedR1 = state.runs[0].jobs.find((job) => job.routeId === "R1")!
    const seedR2 = state.runs[0].jobs.find((job) => job.routeId === "R2")!
    statuses[seedR2.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: state.runs[0].id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    const runID = state.runs[0].id
    const factID = state.runs[0].facts?.[0]?.id
    if (!factID) throw new Error("seed R2 produced no fact; stateJobs=" + JSON.stringify(state.runs[0].jobs))
    await tools["ctf-team-facts"].execute(
      { action: "accept", runID, factID },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    // Expert opens a follow-up intent but does NOT claim it.
    const created = await tools["ctf-team-intent"].execute(
      {
        action: "create",
        title: "replay admin-token output",
        objective: "trigger the admin-token stderr leak deterministically",
        routeId: "R1",
        basedOnFactIds: [factID],
        stopCondition: "leak reproduced or three deterministic attempts exhausted",
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    const intentID = JSON.parse(String(created)).intentID as string

    // R1 worker is still active; it self-claims the next open intent.
    const workerSessionID = seedR1.sessionID!
    const result = JSON.parse(
      String(await tools["ctf-team-claim"].execute({ action: "claim-next" }, { agent: "ctf-web", sessionID: workerSessionID } as any)),
    )
    expect(result.ok).toBe(true)
    expect(result.intentID).toBe(intentID)

    state = await readTeamState(directory)
    const claimedIntent = state.runs[0].intents?.find((intent) => intent.id === intentID)
    expect(claimedIntent?.status).toBe("running")
    const claimedJob = state.runs[0].jobs.find((job) => job.intentId === intentID)
    expect(claimedJob?.sessionID).toBeTruthy()
    expect(claimedJob?.sessionID).not.toBe(seedR1.sessionID)
    expect(claimedIntent?.claimToken).toBe(claimedJob?.ownerToken)

    // Cleanup: idle both the seed R1 and the newly spawned claim worker.
    statuses[seedR1.sessionID!] = { type: "idle" }
    statuses[claimedJob!.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    expect(state.runs[0].intents?.find((intent) => intent.id === intentID)?.status).toBe("completed")
  }, 30_000)

  it("rejects worker self-claim for unbound or stale worker sessions", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "worker-claim-reject-parent"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    await tools["ctf-team-dispatch"].execute(
      {
        title: "reject seed",
        jobs: [
          { title: "R1 probe", objective: "inspect", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "R2 probe", objective: "inspect", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    let state = await readTeamState(directory)
    const runID = state.runs[0].id
    // Mark the run terminal by collecting every worker.
    for (const job of state.runs[0].jobs) statuses[job.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    const terminalWorkerSession = state.runs[0].jobs[0].sessionID!
    expect(state.runs[0].jobs.every((job) => ["completed", "failed"].includes(job.status))).toBe(true)

    // Unbound session: never resolves to a job.
    await expect(
      tools["ctf-team-claim"].execute({ action: "claim-next" }, { agent: "ctf-web", sessionID: "not-a-worker-session" } as any),
    ).rejects.toThrow(/verified Team worker/)

    // Terminal worker: policy + runtime both refuse.
    await expect(
      tools["ctf-team-claim"].execute(
        { action: "claim-next" },
        { agent: "ctf-web", sessionID: terminalWorkerSession } as any,
      ),
    ).rejects.toThrow(/no longer active|not active/)
  }, 30_000)

  it("never lets a worker claim while the run is at max active capacity", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "worker-claim-capacity-parent"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    await tools["ctf-team-dispatch"].execute(
      {
        title: "capacity seed",
        jobs: [
          { title: "R1 probe", objective: "inspect", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "R2 probe", objective: "inspect", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    // Both workers still active (running): a third claim must be refused.
    const state = await readTeamState(directory)
    const firstWorker = state.runs[0].jobs[0].sessionID!
    await expect(
      tools["ctf-team-claim"].execute({ action: "claim-next" }, { agent: "ctf-web", sessionID: firstWorker } as any),
    ).rejects.toThrow(/active workers/)
  }, 30_000)

  it("atomically resolves concurrent self-claims so only one worker wins", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "worker-claim-race-parent"
    const factPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R2",
      statement: "binary leaks admin-token on stderr",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "./vuln 2>&1 | grep admin" }],
    })
    const { client, statuses } = fakeTeamClient([], {
      workerTexts: { 1: "STATUS: completed\nFINDINGS: idle", 2: `\`\`\`json\n${factPacket}\n\`\`\`` },
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 4, maxJobAttempts: 1 })
    await tools["ctf-team-dispatch"].execute(
      {
        title: "race seed",
        jobs: [
          { title: "R1 probe", objective: "inspect", agent: "ctf-web", routeId: "R1", concurrency: "independent" },
          { title: "R2 probe", objective: "inspect", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
        ],
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    // Collect only the R2 worker so its fact lands; R1 stays running.
    let state = await readTeamState(directory)
    const seedR1 = state.runs[0].jobs.find((job) => job.routeId === "R1")!
    const seedR2 = state.runs[0].jobs.find((job) => job.routeId === "R2")!
    statuses[seedR2.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: state.runs[0].id }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    state = await readTeamState(directory)
    const runID = state.runs[0].id
    const firstFact = state.runs[0].facts?.[0]
    const factID = firstFact?.id as string
    await tools["ctf-team-facts"].execute({ action: "accept", runID, factID }, { agent: "ctf-expert", sessionID: parentSessionID } as any)
    const created = await tools["ctf-team-intent"].execute(
      {
        action: "create",
        title: "race follow-up",
        objective: "probe the same endpoint",
        routeId: "R1",
        basedOnFactIds: [factID],
        stopCondition: "one claim wins and the endpoint is probed once",
      },
      { agent: "ctf-expert", sessionID: parentSessionID } as any,
    )
    const intentID = JSON.parse(String(created)).intentID as string
    // Use two active worker sessions by spawning a follow-up job via the Expert;
    // simpler: keep the R1 worker active and reuse its session id twice (both calls
    // resolve to the same caller, so capacity check rejects the second one).
    const workerA = seedR1.sessionID!
    const workerB = seedR1.sessionID!
    void seedR1
    void seedR2

    const results = await Promise.allSettled([
      tools["ctf-team-claim"].execute({ action: "claim-next" }, { agent: "ctf-web", sessionID: workerA } as any),
      tools["ctf-team-claim"].execute({ action: "claim-next" }, { agent: "ctf-web", sessionID: workerB } as any),
    ])
    const winners = results.filter(
      (result): result is PromiseFulfilledResult<string> => result.status === "fulfilled" && JSON.parse(String(result.value)).ok === true,
    )
    const losers = results.filter(
      (result) => result.status === "rejected" || (result.status === "fulfilled" && JSON.parse(String(result.value)).ok !== true),
    )
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    const won = JSON.parse(String(winners[0].value))
    expect(won.intentID).toBe(intentID)
    state = await readTeamState(directory)
    expect(state.runs[0].intents?.filter((intent) => intent.id === intentID)).toHaveLength(1)
    const intentJobs = state.runs[0].jobs.filter((job) => job.intentId === intentID)
    expect(intentJobs).toHaveLength(1)
  }, 30_000)

  it("reopens a spawn-failed claim instead of stranding the intent as failed", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    // Dispatch (create call 1) succeeds; the claim's create (call 2) fails.
    const { client, statuses } = fakeTeamClient([], { failCreateCalls: [2] })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [{ title: "seed route", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }],
      },
      ctx,
    )
    const dispatched = await readTeamState(directory)
    const runID = dispatched.runs[0].id
    const seedSession = dispatched.runs[0].jobs[0].sessionID!
    statuses[seedSession] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, ctx)

    await tools["ctf-team-intent"].execute(
      {
        action: "create",
        title: "follow-up",
        objective: "continue the route",
        routeId: "R2",
        allowUnbased: true,
        stopCondition: "one bounded probe resolves the route",
        runID,
      },
      ctx,
    )

    const claim = JSON.parse(
      String(await tools["ctf-team-intent"].execute({ action: "claim-next", agent: "ctf-pwn", runID }, ctx)),
    )
    expect(claim.ok).toBe(false)
    expect(claim.spawnError).toBeTruthy()

    // The attempt budget is 2 and only one was spent, so the intent must be
    // claimable again rather than parked in `failed`.
    const after = await readTeamState(directory)
    const intent = after.runs[0].intents?.find((candidate) => candidate.id === claim.intentID)
    expect(intent?.status).toBe("open")
    expect(intent?.attempts).toBe(1)
    expect(intent?.claimToken).toBeUndefined()
  }, 30_000)

  it("lets a worker re-claim an intent after release and after a terminal attempt", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 3 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [
          { title: "holder", objective: "stay active", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" },
          { title: "finisher", objective: "complete once", agent: "ctf-rev", routeId: "R2", concurrency: "independent" }
        ],
      },
      ctx,
    )
    const seeded = await readTeamState(directory)
    const runID = seeded.runs[0].id
    const holder = seeded.runs[0].jobs.find((job) => job.title === "holder")!
    const finisher = seeded.runs[0].jobs.find((job) => job.title === "finisher")!
    // Only the finisher reaches idle, so its intent completes while the holder
    // stays active — exactly the state where a released intent used to become
    // permanently unclaimable.
    statuses[finisher.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, ctx)

    const releasedIntentID = finisher.intentId!
    await tools["ctf-team-intent"].execute(
      { action: "release", intentID: releasedIntentID, runID, reason: "retry it" },
      ctx,
    )
    const released = await readTeamState(directory)
    expect(released.runs[0].intents?.find((candidate) => candidate.id === releasedIntentID)?.status).toBe("open")

    const claim = JSON.parse(
      String(
        await tools["ctf-team-claim"].execute(
          { action: "claim-next" },
          toolContext(holder.sessionID!, "ctf-pwn"),
        ),
      ),
    )
    expect(claim.ok).toBe(true)
    const claimed = await readTeamState(directory)
    expect(claimed.runs[0].intents?.find((candidate) => candidate.id === claim.intentID)?.status).toBe("running")
  }, 30_000)

  it("keeps an Expert supersede from being overwritten by a later derived sync", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [
          { title: "holder", objective: "stay active", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" },
          { title: "finisher", objective: "complete once", agent: "ctf-rev", routeId: "R2", concurrency: "independent" },
        ],
      },
      ctx,
    )
    const seeded = await readTeamState(directory)
    const runID = seeded.runs[0].id
    const holder = seeded.runs[0].jobs.find((job) => job.title === "holder")!
    const finisher = seeded.runs[0].jobs.find((job) => job.title === "finisher")!
    statuses[finisher.sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, ctx)

    const supersededID = finisher.intentId!
    await tools["ctf-team-intent"].execute(
      { action: "supersede", intentID: supersededID, runID, reason: "replaced by a better route" },
      ctx,
    )
    expect(
      (await readTeamState(directory)).runs[0].intents?.find((candidate) => candidate.id === supersededID)?.status,
    ).toBe("superseded")

    // A refresh driven by any other job in the run must not revive it.
    await tools["ctf-team-collect"].execute({ runID }, ctx)
    const after = await readTeamState(directory)
    expect(after.runs[0].intents?.find((candidate) => candidate.id === supersededID)?.status).toBe("superseded")
    expect(holder.sessionID).toBeTruthy()
  }, 30_000)

  it("reclaims an expired claim lease and returns the intent to the pool", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const { client, statuses } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 3 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R2", concurrency: "independent" }],
      },
      ctx,
    )
    const seeded = await readTeamState(directory)
    const runID = seeded.runs[0].id

    await tools["ctf-team-intent"].execute(
      {
        action: "create",
        title: "abandoned",
        objective: "was claimed then abandoned",
        routeId: "R2",
        allowUnbased: true,
        stopCondition: "one probe",
        runID,
      },
      ctx,
    )
    const created = await readTeamState(directory)
    const intentID = created.runs[0].intents!.at(-1)!.id

    // The seed worker pulls the intent, so a claim job (and lease) exists while
    // the seed itself stays active.
    const seedSession = seeded.runs[0].jobs[0].sessionID!
    const claimed = JSON.parse(
      String(await tools["ctf-team-claim"].execute({ action: "claim-next" }, toolContext(seedSession, "ctf-pwn"))),
    )
    expect(claimed.ok).toBe(true)
    expect(claimed.intentID).toBe(intentID)

    // Simulate a dead claimant: terminal claim job, stale-but-live session,
    // expired lease.
    await updateTeamState(directory, (draft) => {
      const run = draft.runs.find((candidate) => candidate.id === runID)!
      const intent = run.intents!.find((candidate) => candidate.id === intentID)!
      const job = run.jobs.find((candidate) => candidate.id === intent.claimedBy)!
      job.status = "failed"
      job.sessionID = "stale-worker-session"
      intent.status = "running"
      intent.claimExpiresAt = new Date(Date.now() - 60_000).toISOString()
    })
    const staleSession = "stale-worker-session"
    statuses[staleSession] = { type: "running" }
    const abortsBefore = client.session.abort.mock.calls.length

    await tools["ctf-team-recover"].execute({ runID }, ctx)

    const recovered = await readTeamState(directory)
    const intent = recovered.runs[0].intents?.find((candidate) => candidate.id === intentID)
    expect(intent?.status).toBe("open")
    expect(intent?.claimExpiresAt).toBeUndefined()
    // The stale-but-live session must be aborted before the intent is reopened.
    expect(client.session.abort.mock.calls.length).toBeGreaterThan(abortsBefore)
    const abortedIDs = (client.session.abort.mock.calls as unknown as Array<[{ path?: { id?: string } }]>).map(
      ([request]) => request?.path?.id,
    )
    expect(abortedIDs).toContain(staleSession)
  }, 30_000)
  it("reclaims an expired claim when the session is explicitly absent", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const { client } = fakeTeamClient()
    client.session.get.mockImplementation(async () => ({ error: "404 session not found" } as never))
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 2 })
    const ctx = toolContext("expert-absent-session")
    await tools["ctf-team-dispatch"].execute({ title: "seed", jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }] }, ctx)
    const run = (await readTeamState(directory)).runs[0]
    const intentID = run.intents![0].id
    await updateTeamState(directory, (draft) => {
      const current = draft.runs[0]
      const intent = current.intents!.find((candidate) => candidate.id === intentID)!
      const job = current.jobs.find((candidate) => candidate.id === intent.claimedBy)!
      job.status = "failed"
      job.sessionID = "missing-stale-session"
      intent.status = "running"
      intent.claimExpiresAt = new Date(Date.now() - 60_000).toISOString()
    })
    await tools["ctf-team-recover"].execute({ runID: run.id }, ctx)
    const recovered = (await readTeamState(directory)).runs[0].intents!.find((candidate) => candidate.id === intentID)
    expect(recovered?.status).toBe("open")
    expect(client.session.abort).not.toHaveBeenCalledWith(expect.objectContaining({ path: { id: "missing-stale-session" } }))
  }, 30_000)

  it("records facts from a failed attempt instead of dropping them", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const factPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R1",
      statement: "response header leaks the internal host",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "response", value: "X-Internal: 10.0.0.5" }],
    })
    const failPacket = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "intent_result",
      status: "failed",
      summary: "exploit attempt crashed the service",
      factIds: [],
    })
    const { client, statuses } = fakeTeamClient([], {
      workerTexts: { 1: `\`\`\`json\n${factPacket}\n\`\`\`\n\`\`\`json\n${failPacket}\n\`\`\`` },
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }],
      },
      ctx,
    )
    const seededRun = await readTeamState(directory)
    const runID = seededRun.runs[0].id
    statuses[seededRun.runs[0].jobs[0].sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, ctx)

    const collected = await readTeamState(directory)
    expect(collected.runs[0].facts?.some((fact) => fact.statement.includes("internal host"))).toBe(true)
    expect(collected.runs[0].jobs[0].status).toBe("failed")
    expect(collected.runs[0].intents?.[0].status).toBe("failed")
  }, 30_000)

  it("collects fact packets emitted before the worker's final message", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const early = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R1",
      statement: "early observation",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "file ./chall" }],
    })
    const late = JSON.stringify({
      protocol: "ctf.team.worker.v1",
      type: "fact",
      routeId: "R1",
      statement: "late observation",
      kind: "observation",
      confidence: "observed",
      evidence: [{ type: "command", value: "checksec ./chall" }],
    })
    const { client, statuses } = fakeTeamClient()
    // Multi-turn worker: the file has one bundled message per session, so wrap
    // both turns into the same collected text and rely on the parser scanning
    // the whole bounded text rather than only the tail.
    client.session.messages.mockImplementation(async ({ path: requestPath }: { path: { id: string } }) => {
      if (requestPath.id.startsWith("worker-session-")) {
        return {
          data: [
            { info: { role: "assistant", id: "worker-message-1" }, parts: [{ type: "text", text: `\`\`\`json\n${early}\n\`\`\`` }] },
            { info: { role: "assistant", id: "worker-message-2" }, parts: [{ type: "text", text: `\`\`\`json\n${late}\n\`\`\`` }] },
          ],
        }
      }
      return { data: [{ info: { role: "assistant", providerID: "test-provider", modelID: "test-model" }, parts: [] }] }
    })
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }],
      },
      ctx,
    )
    const seededRun = await readTeamState(directory)
    const runID = seededRun.runs[0].id
    statuses[seededRun.runs[0].jobs[0].sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID }, ctx)

    const statements = (await readTeamState(directory)).runs[0].facts?.map((fact) => fact.statement) ?? []
    expect(statements).toContain("early observation")
    expect(statements).toContain("late observation")
    const collectedState = await readTeamState(directory)
    expect(collectedState.runs[0].jobs[0].lastCollectedMessageId).toBe("worker-message-2")
  }, 30_000)
  it("retains valid packets before a final assistant error and prefers the last valid result", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const firstResult = JSON.stringify({ protocol: "ctf.team.worker.v1", type: "intent_result", status: "completed", summary: "first result" })
    const secondResult = JSON.stringify({ protocol: "ctf.team.worker.v1", type: "intent_result", status: "completed", summary: "last valid result" })
    const fact = JSON.stringify({ protocol: "ctf.team.worker.v1", type: "fact", routeId: "R1", statement: "fact before provider error", kind: "observation", confidence: "observed", evidence: [{ type: "response", value: "evidence" }] })
    const { client, statuses } = fakeTeamClient([], { workerTexts: { 1: "unused" } })
    client.session.messages.mockImplementation(async ({ path: requestPath }: { path: { id: string } }) =>
      requestPath.id.startsWith("worker-session-")
        ? { data: [
          { info: { role: "assistant", id: "result-1" }, parts: [{ type: "text", text: "```json\n" + firstResult + "\n```" }] },
          { info: { role: "assistant", id: "result-2" }, parts: [{ type: "text", text: "```json\n" + fact + "\n```\n```json\n" + secondResult + "\n```" }] },
          { info: { role: "assistant", id: "error-final", error: { name: "UnknownError" } }, parts: [] },
        ] }
        : { data: [{ info: { role: "assistant", providerID: "test-provider", modelID: "test-model" }, parts: [] }] },
    )
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const ctx = toolContext("expert-final-error")
    await tools["ctf-team-dispatch"].execute({ title: "final-error", jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }] }, ctx)
    const run = (await readTeamState(directory)).runs[0]
    statuses[run.jobs[0].sessionID!] = { type: "idle" }
    await tools["ctf-team-collect"].execute({ runID: run.id }, ctx)
    const state = await readTeamState(directory)
    expect(state.runs[0].facts?.map((item) => item.statement)).toContain("fact before provider error")
    expect(state.runs[0].intents?.[0]?.resultSummary).toBe("last valid result")
    expect(state.runs[0].jobs[0].lastCollectedMessageId).toBe("result-2")
  }, 30_000)

  it("refuses an intent with no convergence rule", async () => {
    const directory = await fsTempDirectory()
    await makeEvidenceFixture(directory)
    const parentSessionID = "expert-parent-session"
    const { client } = fakeTeamClient()
    const tools = createTeamTools(client, directory, directory, { maxWorkers: 2, maxJobAttempts: 1 })
    const ctx = toolContext(parentSessionID)

    await tools["ctf-team-dispatch"].execute(
      {
        title: "seed",
        jobs: [{ title: "seed", objective: "seed", agent: "ctf-pwn", routeId: "R1", concurrency: "independent" }],
      },
      ctx,
    )
    const runID = (await readTeamState(directory)).runs[0].id
    await expect(
      tools["ctf-team-intent"].execute(
        { action: "create", title: "no rule", objective: "vague", routeId: "R2", allowUnbased: true, runID },
        ctx,
      ),
    ).rejects.toThrow(/expectedObservation or stopCondition/)
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
