/**
 * Flag verification primitives — single entry point for turning "flag-like
 * output" into a verifiable claim.
 *
 * Design rules (see docs/PLUGIN-EVALUATION-AND-IMPROVEMENT-PLAN.md §4.2):
 * - `shellDetected`, `flagDetected` and other output heuristics are EVIDENCE,
 *   never success by themselves.
 * - Only an independent oracle (exact expected flag, exact hash, or an
 *   independent file oracle compared against an external candidate) upgrades a
 *   candidate to `oracle-verified`.
 * - `flagPattern` is a candidate-format filter, not a proof oracle.
 * - The runner/agent contract must distinguish:
 *   executed / crashed / timeout / primitive-confirmed / interactive-shell /
 *   candidate-flag / oracle-verified / reproduced
 */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { verifyFlag, type ChallengeOracle } from "../packages/ctf-benchmark-core/src/oracle.ts"
import { classifyFlagCandidate, type FlagEvidenceContext } from "../packages/ctf-core/src/flag-rules.ts"

export type FlagVerificationStatus = "oracle-verified" | "candidate" | "unverified" | "rejected"

export type FlagVerification = {
  status: FlagVerificationStatus
  reason: string
  /** The exact string that satisfied the oracle (never set for `candidate`). */
  matchedFlag?: string
  /** SHA-256 of the matched flag, for evidence trails that must not echo the value. */
  matchedFlagSha256?: string
}

export type VerifyCandidateFlagArgs = {
  /** Flag-like strings extracted from solver output (may contain decoys/log noise). */
  candidates: string[]
  /** Exact expected flag from the challenge platform. Highest precedence. */
  expectedFlag?: string
  /** Constrained regex for the known flag format; marks a candidate, not a solve. */
  flagPattern?: string
  /** Optional independent oracle file whose trimmed content is the expected flag. */
  flagFile?: string
  /** sha256 of the expected flag (hash oracle — never echoes the value). */
  expectedFlagSha256?: string
  /** Source context used to permit a bare MD5/SHA256 candidate. */
  candidateContext?: FlagEvidenceContext | string
}

function trimCandidates(candidates: string[]): string[] {
  return [...new Set((candidates ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function buildOracle(args: VerifyCandidateFlagArgs): ChallengeOracle {
  return {
    id: "runtime-flag-oracle",
    family: "generic",
    flagPattern: args.flagPattern,
    expectedFlagSha256: args.expectedFlagSha256,
  }
}

function verified(status: "oracle-verified" | "rejected", reason: string, matchedFlag?: string): FlagVerification {
  return matchedFlag ? { status, reason, matchedFlag, matchedFlagSha256: sha256Hex(matchedFlag) } : { status, reason }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/**
 * Verify candidate flags against an independent oracle.
 *
 * Precedence: exact `expectedFlag` > `flagFile` content > exact hash >
 * constrained `flagPattern` (candidate classification only).
 *
 * Returns `oracle-verified` only when an independent exact check passed.
 * Returns `candidate` when flag-like strings exist but nothing proves them.
 * Returns `rejected` when an exact oracle was supplied and no candidate matched it.
 */
export async function verifyCandidateFlag(args: VerifyCandidateFlagArgs): Promise<FlagVerification> {
  const candidates = trimCandidates(args.candidates)
  const oracle = buildOracle(args)
  const defaultAcceptedCandidates = candidates.filter((candidate) => classifyFlagCandidate(candidate, args.candidateContext))

  let expected = args.expectedFlag?.trim()
  if (args.flagFile) {
    let fileContent: string
    try {
      fileContent = (await readFile(args.flagFile, "utf8")).trim()
    } catch (error) {
      return {
        status: "rejected",
        reason: `flagFile unreadable: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    if (!fileContent) return { status: "rejected", reason: "flagFile is empty" }
    // The file is an INDEPENDENT oracle; it must not become its own candidate.
    expected = expected ?? fileContent
  }

  if (candidates.length === 0) {
    return {
      status: "unverified",
      reason:
        expected || args.expectedFlagSha256 || args.flagPattern || args.flagFile
          ? "oracle or format hints supplied, but no candidate flags were found to verify"
          : "no flag-like strings found to verify",
    }
  }

  if (expected) {
    if (candidates.includes(expected)) {
      return verified(
        "oracle-verified",
        args.flagFile ? "file-check oracle matched external candidate" : "exact expected flag match",
        expected,
      )
    }
    return {
      status: "rejected",
      reason: "candidate flags present but none equals the expected flag",
    }
  }

  if (args.expectedFlagSha256) {
    for (const candidate of candidates) {
      const result = verifyFlag(oracle, candidate)
      if (result.solved) return verified("oracle-verified", "expected flag sha256 matched", candidate)
    }
    return { status: "rejected", reason: "no candidate matched the expected flag sha256" }
  }

  if (args.flagPattern) {
    let pattern: RegExp
    try {
      pattern = new RegExp(args.flagPattern)
    } catch (error) {
      return {
        status: "rejected",
        reason: `invalid flagPattern: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    if (candidates.some((candidate) => pattern.test(candidate))) {
      return {
        status: "candidate",
        reason: "candidate matched supplied flagPattern, but pattern match is not an independent proof oracle",
      }
    }
    return { status: "rejected", reason: "no candidate matched the supplied flagPattern" }
  }

  if (defaultAcceptedCandidates.length === 0) {
    return {
      status: "rejected",
      reason:
        "candidate strings were found, but none matched the strict default rules; bare hashes require explicit flag-file/readflag context",
    }
  }

  return {
    status: "candidate",
    reason:
      "strict flag-shaped candidates found, but no independent oracle was supplied (expectedFlag / expectedFlagSha256 / flagFile)",
  }
}

/**
 * Stable outcome statuses for solver results — the vocabulary every runner
 * and verifier should share. Only `oracle-verified` (and `reproduced` after
 * replay) may be treated as success.
 */
export type SolverOutcomeStatus =
  | "executed"
  | "crashed"
  | "timeout"
  | "primitive-confirmed"
  | "interactive-shell"
  | "candidate-flag"
  | "oracle-verified"
  | "reproduced"

export type SolverOutcomeInput = {
  exitCode: number | string
  timedOut: boolean
  crash: boolean
  flagDetected: boolean
  shellDetected: boolean
  verification: FlagVerification
  primitiveConfirmed?: boolean
}

export function classifySolverOutcome(input: SolverOutcomeInput): SolverOutcomeStatus {
  if (input.verification.status === "oracle-verified") return "oracle-verified"
  if (input.timedOut) return "timeout"
  if (input.crash) return "crashed"
  if (input.flagDetected) return "candidate-flag"
  if (input.shellDetected) return "interactive-shell"
  if (input.primitiveConfirmed) return "primitive-confirmed"
  return "executed"
}

/** Success classification for consumers that need a single scalar. */
export type SuccessClass = "oracle-verified" | "candidate" | "partial" | "none"

export function successClassFrom(input: SolverOutcomeInput): SuccessClass {
  if (input.verification.status === "oracle-verified") return "oracle-verified"
  if (input.verification.status === "candidate") return "candidate"
  if (input.shellDetected && !input.crash && !input.timedOut) return "partial"
  return "none"
}
