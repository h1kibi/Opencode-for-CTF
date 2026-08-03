import { describe, expect, it } from "vitest"
import { verifyFlag } from "../packages/ctf-benchmark-core/src/oracle.ts"

describe("challenge flag oracle", () => {
  it("rejects a hash-mismatched flag without exposing the value", () => {
    const result = verifyFlag({ id: "demo", family: "misc", expectedFlagSha256: "a".repeat(64) }, "flag{wrong}")
    expect(result.solved).toBe(false)
    expect(result.reason).toContain("independent oracle")
  })

  it("treats a valid fixture pattern as candidate evidence, not proof", () => {
    const result = verifyFlag({ id: "demo", family: "web", flagPattern: "^flag\{[a-z]+\}$" }, "flag{ok}")
    expect(result.solved).toBe(false)
    expect(result.formatMatched).toBe(true)
    expect(result.reason).toContain("not a proof oracle")
    expect(result.flagSha256).toHaveLength(64)
  })
})
