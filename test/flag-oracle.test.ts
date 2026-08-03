import { createHash } from "node:crypto"
import { mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import {
  classifySolverOutcome,
  successClassFrom,
  verifyCandidateFlag,
  type SolverOutcomeInput,
} from "../src/flag-oracle.ts"

describe("verifyCandidateFlag", () => {
  it("verifies an exact expected flag", async () => {
    const result = await verifyCandidateFlag({ candidates: ["flag{abc}", "log noise"], expectedFlag: "flag{abc}" })
    expect(result.status).toBe("oracle-verified")
    expect(result.matchedFlag).toBe("flag{abc}")
    expect(result.matchedFlagSha256).toHaveLength(64)
  })

  it("rejects flag-like strings when an exact oracle exists but nothing matches", async () => {
    const result = await verifyCandidateFlag({ candidates: ["flag{decoy}"], expectedFlag: "flag{real}" })
    expect(result.status).toBe("rejected")
    expect(result.matchedFlag).toBeUndefined()
  })

  it("keeps flag-like strings as candidate when no oracle is supplied", async () => {
    const result = await verifyCandidateFlag({ candidates: ["flag{decoy_payload}"] })
    expect(result.status).toBe("candidate")
  })

  it("returns unverified when no flag-like strings exist", async () => {
    const result = await verifyCandidateFlag({ candidates: [] })
    expect(result.status).toBe("unverified")
  })

  it("treats a constrained flag pattern as candidate evidence, not proof", async () => {
    const result = await verifyCandidateFlag({ candidates: ["flag{ok}"], flagPattern: "^flag\{[a-z]+\}$" })
    expect(result.status).toBe("candidate")
    expect(result.reason).toContain("not an independent proof oracle")
  })

  it("rejects an invalid flag pattern instead of crashing", async () => {
    const result = await verifyCandidateFlag({ candidates: ["flag{ok}"], flagPattern: "([" })
    expect(result.status).toBe("rejected")
  })

  it("does not let flagFile self-verify without an external candidate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctf-flag-oracle-"))
    const file = join(dir, "flag.txt")
    await writeFile(file, "flag{from-file}\n", "utf8")
    const result = await verifyCandidateFlag({ candidates: [], flagFile: file })
    expect(result.status).toBe("unverified")
  })

  it("verifies when an external candidate matches the flagFile oracle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ctf-flag-oracle-"))
    const file = join(dir, "flag.txt")
    await writeFile(file, "flag{from-file}\n", "utf8")
    const result = await verifyCandidateFlag({ candidates: ["flag{from-file}"], flagFile: file })
    expect(result.status).toBe("oracle-verified")
    expect(result.matchedFlag).toBe("flag{from-file}")
  })

  it("verifies via expected flag sha256 without echoing the expected value", async () => {
    const sha = createHash("sha256").update("flag{h}").digest("hex")
    const result = await verifyCandidateFlag({ candidates: ["flag{h}"], expectedFlagSha256: sha })
    expect(result.status).toBe("oracle-verified")
    expect(result.matchedFlag).toBe("flag{h}")
  })
})

function outcome(overrides: Partial<SolverOutcomeInput> = {}): SolverOutcomeInput {
  return {
    exitCode: 0,
    timedOut: false,
    crash: false,
    flagDetected: false,
    shellDetected: false,
    verification: { status: "unverified", reason: "none" },
    ...overrides,
  }
}

describe("solver outcome classification", () => {
  it("classifies oracle-verified as the only success status", () => {
    const o = outcome({
      flagDetected: true,
      shellDetected: true,
      verification: { status: "oracle-verified", reason: "exact", matchedFlag: "flag{x}" },
    })
    expect(classifySolverOutcome(o)).toBe("oracle-verified")
    expect(successClassFrom(o)).toBe("oracle-verified")
  })

  it("never upgrades shell-like evidence to success", () => {
    const o = outcome({ shellDetected: true })
    expect(classifySolverOutcome(o)).toBe("interactive-shell")
    expect(successClassFrom(o)).toBe("partial")
  })

  it("treats flag-like strings without an oracle as candidate", () => {
    const o = outcome({ flagDetected: true, verification: { status: "candidate", reason: "no oracle" } })
    expect(classifySolverOutcome(o)).toBe("candidate-flag")
    expect(successClassFrom(o)).toBe("candidate")
  })

  it("keeps crash/timeout classifications", () => {
    expect(classifySolverOutcome(outcome({ crash: true }))).toBe("crashed")
    expect(classifySolverOutcome(outcome({ timedOut: true }))).toBe("timeout")
    expect(classifySolverOutcome(outcome())).toBe("executed")
  })
})
