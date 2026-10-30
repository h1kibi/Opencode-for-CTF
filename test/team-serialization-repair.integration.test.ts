import { createServer, type Server } from "node:http"
import { writeFile } from "node:fs/promises"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { afterEach, describe, expect, it } from "vitest"
import { createTeamTools } from "../src/team-runtime.ts"
import { readTeamState } from "../src/team/team-state.ts"

import { makeTestWorkspace } from "./support/test-workspace.ts"
const time = "2026-08-04T00:00:00.000Z"

type WorkerMessage = {
  info: { role: string; id: string }
  parts: Array<{ type: "text"; text: string }>
}

function packet(summary: string) {
  return JSON.stringify({
    protocol: "ctf.team.probe.v1",
    type: "probe_result",
    status: "completed",
    summary,
    observations: [],
    artifacts: [],
  })
}

function fenced(summary: string) {
  const fence = "`".repeat(3)
  return `\n${fence}json\n${packet(summary)}\n${fence}\n`
}

function message(id: string, text: string): WorkerMessage {
  return { info: { role: "assistant", id }, parts: [{ type: "text", text }] }
}

async function seed(directory: string) {
  await writeFile(
    `${directory}/.ctf-team.json`,
    JSON.stringify({
      schemaVersion: 2,
      revision: 0,
      updatedAt: time,
      activeRunID: "run-1",
      runs: [
        {
          id: "run-1",
          title: "serialization repair",
          parentSessionID: "parent-1",
          status: "running",
          createdAt: time,
          updatedAt: time,
          notificationPending: false,
          probes: [
            {
              id: "probe-1",
              title: "worker packet",
              objective: "return a valid packet",
              agent: "ctf-web",
              routeId: "R1",
              concurrency: "independent",
              status: "running",
              createdAt: time,
              updatedAt: time,
            },
          ],
          jobs: [
            {
              id: "job-1",
              probeId: "probe-1",
              agent: "ctf-web",
              sessionID: "worker-1",
              status: "running",
              createdAt: time,
              updatedAt: time,
              attempt: 0,
              ownerToken: "owner-1",
            },
          ],
        },
      ],
    }),
    "utf8",
  )
}

async function startOpenCodeProtocolServer(directory: string, messages: WorkerMessage[]) {
  const promptBodies: unknown[] = []
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" })
      response.end(JSON.stringify(value))
    }

    if (request.method === "GET" && url.pathname === "/session/status") {
      json(200, { "worker-1": { type: "idle" } })
      return
    }
    if (request.method === "GET" && url.pathname === "/session/worker-1/message") {
      json(200, messages)
      return
    }
    if (request.method === "POST" && url.pathname === "/session/worker-1/prompt_async") {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        promptBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")))
        json(200, {})
      })
      return
    }
    json(404, { error: `Unhandled ${request.method} ${url.pathname}` })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("OpenCode protocol server did not bind")
  return {
    client: createOpencodeClient({ baseUrl: `http://127.0.0.1:${address.port}`, directory }),
    promptBodies,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function collect(directory: string, client: OpencodeClient) {
  const tools = createTeamTools(client, directory)
  return tools["ctf-team-collect"].execute({ runID: "run-1" }, {
    agent: "ctf-expert",
    sessionID: "parent-1",
    directory,
  } as never)
}

describe("Team worker serialization repair", () => {
  const servers: Array<{ close: () => Promise<void> }> = []

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close()
  })

  it("sends one repair prompt and completes after the next valid packet", async () => {
    const directory = makeTestWorkspace("ctf-team-serialization-success")
    await seed(directory)
    const messages = [message("message-1", "worker prose without a fenced packet")]
    const protocol = await startOpenCodeProtocolServer(directory, messages)
    servers.push(protocol)

    await collect(directory, protocol.client)
    let state = await readTeamState(directory)
    expect(state.runs[0].jobs[0]).toMatchObject({
      status: "running",
      serializationRepairAttempts: 1,
      serializationRepairPending: true,
      lastCollectedMessageId: "message-1",
    })
    expect(protocol.promptBodies).toHaveLength(1)
    expect(JSON.stringify(protocol.promptBodies[0])).toContain("valid fenced JSON packet")

    await collect(directory, protocol.client)
    expect(protocol.promptBodies).toHaveLength(1)
    expect((await readTeamState(directory)).runs[0].jobs[0].serializationRepairPending).toBe(true)

    messages.splice(0, messages.length, message("message-2", fenced("repaired packet")))
    await collect(directory, protocol.client)
    state = await readTeamState(directory)
    expect(state.runs[0].jobs[0]).toMatchObject({ status: "completed", serializationRepairAttempts: 1 })
    expect(state.runs[0].jobs[0].serializationRepairPending).toBe(false)
    expect(state.runs[0].probes[0].result?.summary).toBe("repaired packet")
  })

  it("terminalizes a second malformed packet without sending another repair", async () => {
    const directory = makeTestWorkspace("ctf-team-serialization-failure")
    await seed(directory)
    const messages = [message("message-1", "first malformed packet")]
    const protocol = await startOpenCodeProtocolServer(directory, messages)
    servers.push(protocol)

    await collect(directory, protocol.client)
    messages.splice(0, messages.length, message("message-2", "second malformed packet"))
    await collect(directory, protocol.client)

    const state = await readTeamState(directory)
    expect(protocol.promptBodies).toHaveLength(1)
    expect(state.runs[0].jobs[0]).toMatchObject({
      status: "failed",
      serializationRepairAttempts: 1,
      serializationRepairPending: false,
      errorDetails: { errorType: "serialization", retryable: false },
    })
    expect(state.runs[0].probes[0].status).toBe("failed")
  })
})
