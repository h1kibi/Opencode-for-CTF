import { describe, expect, it } from "vitest"
import {
  COMMAND_SURFACE,
  clampScore,
  decideRoute,
  DEFAULT_RISK_BUDGET,
  scoreAttackQueue,
  scoreCategories,
} from "../packages/ctf-core/src/index.js"

describe("scoreAttackQueue", () => {
  it("returns a positive score for high-value low-cost attacks", () => {
    const score = scoreAttackQueue({ value: 5, cost: 1, risk: 1, stability: 4, confidence: 4 })
    expect(score).toBe(5 + 4 + 4 - 1 - 1) // = 11
  })

  it("returns a lower or negative score for high-risk attacks", () => {
    const score = scoreAttackQueue({ value: 3, cost: 4, risk: 5, stability: 1, confidence: 1 })
    expect(score).toBe(3 + 1 + 1 - 4 - 5) // = -4
  })
})

describe("clampScore", () => {
  it("clamps values below 1 to 1", () => {
    expect(clampScore(0)).toBe(1)
    expect(clampScore(-5)).toBe(1)
  })

  it("clamps values above 5 to 5", () => {
    expect(clampScore(10)).toBe(5)
    expect(clampScore(7)).toBe(5)
  })

  it("leaves values within range unchanged", () => {
    expect(clampScore(1)).toBe(1)
    expect(clampScore(3)).toBe(3)
    expect(clampScore(5)).toBe(5)
  })
})

describe("DEFAULT_RISK_BUDGET", () => {
  it("has reasonable default values", () => {
    expect(DEFAULT_RISK_BUDGET.requests).toBeGreaterThan(0)
    expect(DEFAULT_RISK_BUDGET.concurrency).toBe(1)
  })
})

describe("scoreCategories", () => {
  it("scores web URLs above pwn noise", () => {
    const ranked = scoreCategories({ text: "http://127.0.0.1:8000 flask xss admin bot" })
    expect(ranked[0]?.category).toBe("web")
    expect(ranked[0]!.score).toBeGreaterThan(0)
  })

  it("scores pwn tooling signals", () => {
    const ranked = scoreCategories({ text: "checksec libc ret2libc pwntools ELF remote" })
    expect(ranked[0]?.category).toBe("pwn")
  })
})

describe("decideRoute", () => {
  it("resumes when evidence branch is present", () => {
    const d = decideRoute({ text: "web chall", hasEvidenceBranch: true })
    expect(d.mode).toBe("resume")
    expect(d.command).toBe("/resume")
    expect(d.primaryAgent).toBe("ctf-expert")
    expect(d.agent).toBe("ctf-expert")
  })

  it("forces expert mode when requested", () => {
    const d = decideRoute({ text: "simple xor", mode: "expert" })
    expect(d.mode).toBe("expert")
    expect(d.agent).toBe("ctf-expert")
  })

  it("routes strong pwn signals toward pwn or fast lane", () => {
    const d = decideRoute({
      text: "checksec full RELRO libc heap tcache pwntools chall.elf",
      mode: "auto",
    })
    expect(["fast", "expert"]).toContain(d.mode)
    expect(d.primaryAgent).toBe(d.mode === "fast" ? "ctf-fast" : "ctf-expert")
    expect(d.category).toBe("pwn")
  })

  it("exposes a small L0 command surface", () => {
    expect(COMMAND_SURFACE.L0.some((c) => c.command === "/ctf")).toBe(true)
    expect(COMMAND_SURFACE.L0.length).toBeLessThanOrEqual(8)
  })
})
