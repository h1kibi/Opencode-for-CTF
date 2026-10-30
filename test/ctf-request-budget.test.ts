import { describe, expect, it, afterEach } from "vitest"
import { createServer } from "node:http"
import { CtfRequestBudget } from "../tools/lib/ctf-request-budget.ts"
import { validateWebUrl } from "../tools/lib/web-http.ts"

const originalAllowedHosts = process.env.CTF_ALLOWED_HOSTS

afterEach(() => {
  if (originalAllowedHosts === undefined) delete process.env.CTF_ALLOWED_HOSTS
  else process.env.CTF_ALLOWED_HOSTS = originalAllowedHosts
})

describe("web host policy", () => {
  it("allows loopback but blocks restricted IPs and private hostnames by default", () => {
    expect(validateWebUrl("http://127.0.0.1:8080/probe").hostname).toBe("127.0.0.1")
    expect(() => validateWebUrl("http://10.0.0.1:8080/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("http://lab.internal:8080/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("ftp://127.0.0.1:8080/probe")).toThrow(/unsupported Web URL scheme/)
  })

  it("requires an exact allowlisted host and port for restricted targets", () => {
    process.env.CTF_ALLOWED_HOSTS = "10.0.0.1:8080,lab.internal:9000"
    expect(validateWebUrl("http://10.0.0.1:8080/probe").port).toBe("8080")
    expect(validateWebUrl("http://lab.internal:9000/probe").hostname).toBe("lab.internal")
    expect(() => validateWebUrl("http://10.0.0.1:8081/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("http://lab.internal:9001/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("http://10.0.0.2:8080/probe")).toThrow(/restricted Web host/)
  })

  it("ignores malformed allowlist entries instead of broadening access", () => {
    process.env.CTF_ALLOWED_HOSTS = "10.0.0.1:not-a-port, http://10.0.0.2, 10.0.0.3:70000"
    expect(() => validateWebUrl("http://10.0.0.1:8080/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("http://10.0.0.2:8080/probe")).toThrow(/restricted Web host/)
    expect(() => validateWebUrl("http://10.0.0.3:8080/probe")).toThrow(/restricted Web host/)
  })
})

describe("CTF request budget", () => {
  it("assigns probe ids, captures hashes, and resets failure backoff after success", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "set-cookie": ["probe=ok"] })
      response.end("ok")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("server did not bind")
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0, baseBackoffMs: 0, maxBackoffMs: 0 })
      const url = `http://127.0.0.1:${address.port}/probe`
      const first = await budget.request(url, {}, false, "first")
      const second = await budget.request(url, {}, true, "second")
      expect(first.observation.id).toBe("probe-001")
      expect(second.observation.id).toBe("probe-002")
      expect(first.observation.responseHash).toMatch(/^[a-f0-9]{16}$/)
      expect(budget.stateChangingRequests).toBe(1)
      expect(budget.routeState).toBe("ready")
      expect(budget.cookieHeader()).toBe("probe=ok")
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it("blocks cross-origin requests before attaching the session cookie", async () => {
    const budget = new CtfRequestBudget({ minIntervalMs: 0, allowedOrigin: "http://challenge.local" }, "session=secret")
    await expect(budget.request("http://outside.example/probe")).rejects.toMatchObject({ code: "origin_blocked" })
    expect(budget.requests).toBe(0)
  })

  it("fails closed on a connection reset without retrying the request", async () => {
    const server = createServer((request) => request.socket.destroy())
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("server did not bind")
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0 })
      await expect(budget.request(`http://127.0.0.1:${address.port}/probe`)).rejects.toMatchObject({
        code: "connection_reset",
      })
      expect(budget.routeState).toBe("unstable")
      expect(budget.observations[0]).toMatchObject({ connectionReset: true, id: "probe-001" })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  it("marks a route blocked after repeated ordinary failures", async () => {
    const server = createServer((request) => request.socket.destroy())
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("server did not bind")
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0, stopOnConnectionReset: false, maxConsecutiveFailures: 2 })
      const url = `http://127.0.0.1:${address.port}/probe`
      await expect(budget.request(url)).rejects.toBeInstanceOf(Error)
      await expect(budget.request(url)).rejects.toMatchObject({ code: "unstable" })
      await expect(budget.request(url)).rejects.toMatchObject({ code: "unstable" })
      expect(budget.routeState).toBe("blocked")
      expect(budget.observations.map((item) => item.consecutiveFailures)).toEqual([1, 2])
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
