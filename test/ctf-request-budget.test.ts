import { describe, expect, it, vi } from "vitest"
import { BudgetStopError, CtfRequestBudget } from "../tools/lib/ctf-request-budget.ts"

describe("CTF request budget", () => {
  it("assigns probe ids, captures hashes, and resets failure backoff after success", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0, baseBackoffMs: 0, maxBackoffMs: 0 })
      const first = await budget.request("http://127.0.0.1/probe", {}, false, "first")
      const second = await budget.request("http://127.0.0.1/probe", {}, true, "second")
      expect(first.observation.id).toBe("probe-001")
      expect(second.observation.id).toBe("probe-002")
      expect(first.observation.responseHash).toMatch(/^[a-f0-9]{16}$/)
      expect(budget.stateChangingRequests).toBe(1)
      expect(budget.routeState).toBe("ready")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("blocks cross-origin requests before attaching the session cookie", async () => {
    const fetchMock = vi.fn(async () => new Response("should not run", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      const budget = new CtfRequestBudget(
        { minIntervalMs: 0, allowedOrigin: "http://challenge.local" },
        "session=secret",
      )
      await expect(budget.request("http://outside.local/probe")).rejects.toMatchObject({ code: "origin_blocked" })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(budget.requests).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("fails closed on a connection reset without retrying the request", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET")
    })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0 })
      await expect(budget.request("http://127.0.0.1/probe")).rejects.toMatchObject({ code: "connection_reset" })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(budget.routeState).toBe("unstable")
      expect(budget.observations[0]).toMatchObject({ connectionReset: true, id: "probe-001" })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("marks a route blocked after repeated ordinary failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("upstream unavailable")
    })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const budget = new CtfRequestBudget({ minIntervalMs: 0, stopOnConnectionReset: false, maxConsecutiveFailures: 2 })
      await expect(budget.request("http://127.0.0.1/probe")).rejects.toThrow("upstream unavailable")
      await expect(budget.request("http://127.0.0.1/probe")).rejects.toMatchObject({ code: "unstable" })
      await expect(budget.request("http://127.0.0.1/probe")).rejects.toMatchObject({ code: "unstable" })
      expect(budget.routeState).toBe("blocked")
      expect(budget.observations.map((item) => item.consecutiveFailures)).toEqual([1, 2])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
