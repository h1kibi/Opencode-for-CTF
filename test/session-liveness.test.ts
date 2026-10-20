import { describe, expect, it, vi } from "vitest"
import { hasOpenTeamWorker, probeSessionPresence } from "../src/team/session-liveness.ts"

describe("session liveness", () => {
  it("fails closed when the SDK has no session presence surface", async () => {
    await expect(probeSessionPresence({}, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })

  it("fails closed when session.get does not return a data field", async () => {
    const client = { session: { get: vi.fn(async () => ({})) } }
    await expect(probeSessionPresence(client, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })

  it("recognizes a present session only when the returned identity matches", async () => {
    const client = { session: { get: vi.fn(async () => ({ data: { id: "parent-1" } })) } }
    const mismatchedClient = { session: { get: vi.fn(async () => ({ data: { id: "other-parent" } })) } }
    const anonymousClient = { session: { get: vi.fn(async () => ({ data: {} })) } }
    await expect(probeSessionPresence(client, "/tmp/ctf", "parent-1")).resolves.toBe("present")
    await expect(probeSessionPresence(mismatchedClient, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
    await expect(probeSessionPresence(anonymousClient, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })

  it("recognizes null data and structured 404 errors as absent", async () => {
    const nullClient = { session: { get: vi.fn(async () => ({ data: null })) } }
    const notFoundClient = {
      session: { get: vi.fn(async () => ({ error: { statusCode: 404, message: "session lookup failed" } })) },
    }
    await expect(probeSessionPresence(nullClient, "/tmp/ctf", "parent-1")).resolves.toBe("absent")
    await expect(probeSessionPresence(notFoundClient, "/tmp/ctf", "parent-1")).resolves.toBe("absent")
  })

  it("does not mistake an unrelated SDK error for absence", async () => {
    const client = { session: { get: vi.fn(async () => ({ error: { status: 503, message: "service unavailable" } })) } }
    await expect(probeSessionPresence(client, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })

  it("falls back to session.list and remains fail-closed on list errors", async () => {
    const presentClient = { session: { list: vi.fn(async () => ({ data: [{ id: "parent-1" }] })) } }
    const absentClient = { session: { list: vi.fn(async () => ({ data: [{ id: "other" }] })) } }
    const unknownClient = { session: { list: vi.fn(async () => ({ error: "list unavailable" })) } }
    await expect(probeSessionPresence(presentClient, "/tmp/ctf", "parent-1")).resolves.toBe("present")
    await expect(probeSessionPresence(absentClient, "/tmp/ctf", "parent-1")).resolves.toBe("absent")
    await expect(probeSessionPresence(unknownClient, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })

  it("treats thrown not-found errors as absence but other failures as unknown", async () => {
    const absentClient = {
      session: {
        get: vi.fn(async () => {
          throw new Error("404 session not found")
        }),
      },
    }
    const unknownClient = {
      session: {
        get: vi.fn(async () => {
          throw new Error("network timeout")
        }),
      },
    }
    await expect(probeSessionPresence(absentClient, "/tmp/ctf", "parent-1")).resolves.toBe("absent")
    await expect(probeSessionPresence(unknownClient, "/tmp/ctf", "parent-1")).resolves.toBe("unknown")
  })
})

describe("open Team workers", () => {
  const baseRun = { jobs: [] } as any

  it("accepts only fully terminal jobs", () => {
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status: "completed" }, { status: "failed" }] })).toBe(false)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status: "cancelled" }, { status: "interrupted" }] })).toBe(false)
  })

  it("blocks adoption for active, retrying, or uncertain jobs", () => {
    for (const status of ["starting", "running", "retrying", "cancelling"]) {
      expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status }] })).toBe(true)
    }
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status: "failed", retryPending: true }] })).toBe(true)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status: "failed", retrySessionID: "retry-1" }] })).toBe(true)
    expect(hasOpenTeamWorker({ ...baseRun, jobs: [{ status: "cancel_failed" }] })).toBe(false)
  })
})
