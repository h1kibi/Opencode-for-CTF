import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

export type ChallengeOracle = {
  id: string
  family: string
  flagPattern?: string
  expectedFlagSha256?: string
}

export type OracleResult = {
  solved: boolean
  formatMatched?: boolean
  reason: string
  flagSha256?: string
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/**
 * Verify a candidate flag without relying on benchmark notes or keywords.
 * Exact-hash matches count as solved. Constrained regexes only classify a
 * candidate as plausibly flag-shaped; they do NOT prove the challenge is solved.
 * The oracle never returns the flag itself.
 */
export function verifyFlag(oracle: ChallengeOracle, candidate: string): OracleResult {
  const value = candidate.trim()
  if (!value) return { solved: false, reason: "empty candidate" }
  const digest = sha256(value)
  if (oracle.expectedFlagSha256 && digest === oracle.expectedFlagSha256.toLowerCase()) {
    return { solved: true, reason: "exact flag hash matched", flagSha256: digest }
  }
  if (oracle.flagPattern) {
    let pattern: RegExp
    try {
      pattern = new RegExp(oracle.flagPattern)
    } catch {
      return { solved: false, reason: "oracle flag pattern is invalid", flagSha256: digest }
    }
    if (pattern.test(value)) {
      return {
        solved: false,
        formatMatched: true,
        reason: "candidate matched oracle flag pattern, but pattern is not a proof oracle",
        flagSha256: digest,
      }
    }
  }
  return { solved: false, reason: "candidate did not satisfy independent oracle", flagSha256: digest }
}

export async function verifyFlagFile(oracle: ChallengeOracle, file: string): Promise<OracleResult> {
  return verifyFlag(oracle, await readFile(file, "utf8"))
}
