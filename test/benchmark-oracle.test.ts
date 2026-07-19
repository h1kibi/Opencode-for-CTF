import { describe, expect, it } from "vitest"
import { verifyFlag } from "../packages/ctf-benchmark-core/src/oracle.ts"

describe("challenge flag oracle", () => {
  it("accepts a hash-matched flag without exposing the value", () => {
    const result = verifyFlag({ id: "demo", family: "misc", expectedFlagSha256: "a".repeat(64) }, "flag{wrong}")
    expect(result.solved).toBe(false)
    expect(result.reason).toContain("independent oracle")
  })

  it("accepts a valid fixture pattern", () => {
    const result = verifyFlag({ id: "demo", family: "web", flagPattern: "^flag\\{[a-z]+\\}$" }, "flag{ok}")
    expect(result.solved).toBe(true)
    expect(result.flagSha256).toHaveLength(64)
  })
})
