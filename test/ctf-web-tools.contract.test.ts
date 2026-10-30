import { createServer, type Server } from "node:http"
import { rm } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"
import blindSqli from "../tools/web/ctf-web-blind-sqli.ts"
import xxeClosure from "../tools/web/ctf-web-xxe-closure.ts"

function jsonOutput(value: unknown) {
  return JSON.parse(String(value)) as Record<string, unknown>
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

describe("new CTF web tool contracts", () => {
  it("returns a bounded partial blind-SQLi result and checkpoints on budget exhaustion", async () => {
    const directory = await makeTestWorkspaceAsync("ctf-blind-contract")
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`)
      response.writeHead(200)
      response.end("TRUE")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("server did not bind")
    try {
      const result = jsonOutput(
        await blindSqli.execute(
          {
            baseUrl: `http://127.0.0.1:${address.port}`,
            registrationPath: "/register",
            parameter: "email",
            oracleUrl: "/user/{username}",
            oracleSelector: "TRUE",
            payloadTemplate: "{prefix}' OR ({condition})--",
            expression: "password",
            charset: "AB",
            maxLength: 1,
            maxRequests: 2,
            maxStateChangingRequests: 2,
            minIntervalMs: 0,
            challenge: "contract",
          },
          { directory } as never,
        ),
      )
      expect(result.partial).toBe(true)
      expect(result.completed).toBe(false)
      expect(result.stop_reason).toContain("budget_exhausted")
      expect(result.requests).toBe(2)
      expect(result.state_changing_requests).toBe(1)
      expect(result.checkpoint).toContain("blind-sqli-checkpoint.json")
      expect(requests).toHaveLength(2)
    } finally {
      await closeServer(server)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("runs XXE canary before target reads and preserves parser-conflict evidence", async () => {
    const directory = await makeTestWorkspaceAsync("ctf-xxe-contract")
    let previews = 0
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`)
      if (request.method === "POST") {
        response.writeHead(200)
        response.end("stored: probe.xml")
        return
      }
      previews++
      response.writeHead(200)
      response.end(
        previews === 1 ? "hostname-value" : 'Traceback\n  File "/app/app.py", line 373\nStartTag: invalid element name',
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("server did not bind")
    try {
      const result = jsonOutput(
        await xxeClosure.execute(
          {
            baseUrl: `http://127.0.0.1:${address.port}`,
            uploadPath: "/admin/upload",
            previewPattern: "/admin/preview/{stored}",
            field: "file",
            targetFiles: ["/app/app.py"],
            filenamePrefix: "canary",
            canaryFile: "/etc/hostname",
            maxRequests: 4,
            maxStateChangingRequests: 2,
            minIntervalMs: 0,
            challenge: "contract",
          },
          { directory } as never,
        ),
      ) as {
        xxe_verified: boolean
        reads: Array<{ state: string }>
        source_hints: unknown[]
        state_changing_requests: number
        chunk_plan: { mode: string; executed: boolean }
      }
      expect(requests.map((request) => request.split(" ", 1)[0])).toEqual(["POST", "GET", "POST", "GET"])
      expect(result.xxe_verified).toBe(true)
      expect(result.reads[1].state).toBe("read_success_parse_conflict")
      expect(result.source_hints).toContainEqual({ file: "/app/app.py", line: 373 })
      expect(result.state_changing_requests).toBe(2)
      expect(result.chunk_plan.mode).toBe("target-per-upload")
      expect(result.chunk_plan.executed).toBe(false)
    } finally {
      await closeServer(server)
      await rm(directory, { recursive: true, force: true })
    }
  })
})
