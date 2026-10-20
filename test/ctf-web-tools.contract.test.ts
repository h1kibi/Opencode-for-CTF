import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import blindSqli from "../tools/web/ctf-web-blind-sqli.ts"
import xxeClosure from "../tools/web/ctf-web-xxe-closure.ts"

function jsonOutput(value: unknown) {
  return JSON.parse(String(value)) as Record<string, any>
}

describe("new CTF web tool contracts", () => {
  it("returns a bounded partial blind-SQLi result and checkpoints on budget exhaustion", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-blind-contract-"))
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "POST" && url.endsWith("/register")) return new Response("registered", { status: 200 })
      return new Response("TRUE", { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const result = jsonOutput(
        await blindSqli.execute(
          {
            baseUrl: "http://challenge.local",
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
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("runs XXE canary before target reads and preserves parser-conflict evidence", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctf-xxe-contract-"))
    let previews = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "POST") {
        const body = String((init.body as FormData | undefined)?.entries ? "" : init.body || "")
        return new Response(url.includes("upload") ? "stored: probe.xml" : body, { status: 200 })
      }
      previews++
      return new Response(
        previews === 1 ? "hostname-value" : 'Traceback\n  File "/app/app.py", line 373\nStartTag: invalid element name',
        { status: 200 },
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const result = jsonOutput(
        await xxeClosure.execute(
          {
            baseUrl: "http://challenge.local",
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
      )
      expect(fetchMock).toHaveBeenCalledTimes(4)
      expect(fetchMock.mock.calls.map(([, init]) => init?.method || "GET")).toEqual(["POST", "GET", "POST", "GET"])
      expect(result.xxe_verified).toBe(true)
      expect(result.reads[1].state).toBe("read_success_parse_conflict")
      expect(result.source_hints).toContainEqual({ file: "/app/app.py", line: 373 })
      expect(result.state_changing_requests).toBe(2)
      expect(result.chunk_plan.mode).toBe("target-per-upload")
      expect(result.chunk_plan.executed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
