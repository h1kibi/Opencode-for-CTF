import { tool } from "@opencode-ai/plugin"
import { resolveAllowedPath } from "../lib/path-policy.ts"
import { verifyCandidateFlag, type VerifyCandidateFlagArgs } from "../../src/flag-oracle.ts"
import type { FlagEvidenceContext } from "../../packages/ctf-core/src/flag-rules.ts"

function parseCandidates(value: string | undefined, single: string | undefined): string[] {
  if (single?.trim()) return [single.trim()]
  if (!value?.trim()) return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error("candidatesJson must be a JSON array of strings")
  return parsed.map((item, index) => {
    if (typeof item !== "string") throw new Error(`candidatesJson[${index}] must be a string`)
    return item
  })
}

function parseContext(value: string | undefined): FlagEvidenceContext | string | undefined {
  if (!value?.trim()) return undefined
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed === "string") return parsed
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("candidateContextJson must be a JSON object or string")
  }
  return parsed as FlagEvidenceContext
}

/**
 * Independent flag-oracle facade.
 *
 * This tool deliberately separates candidate extraction from proof. A format
 * match or a custom regex can only return `candidate`; exact flag, file, or
 * SHA-256 evidence is required for `oracle-verified`.
 */
export default tool({
  description:
    "Verify CTF flag candidates with the strict default rules and an independent exact/file/SHA-256 oracle. Pattern matches remain candidates and never prove success.",
  args: {
    candidatesJson: tool.schema
      .string()
      .optional()
      .describe("JSON array of candidate strings; preserve the original source context separately"),
    candidate: tool.schema.string().optional().describe("Convenience form for one candidate string"),
    expectedFlag: tool.schema.string().optional().describe("Exact expected flag from an independent challenge oracle"),
    flagFile: tool.schema
      .string()
      .optional()
      .describe("Workspace-scoped file whose trimmed content is an independent expected-flag oracle"),
    expectedFlagSha256: tool.schema.string().optional().describe("Expected SHA-256 of the exact flag"),
    flagPattern: tool.schema
      .string()
      .optional()
      .describe("Challenge-specific format filter; this can classify a candidate but cannot verify it"),
    candidateContextJson: tool.schema
      .string()
      .optional()
      .describe("JSON object/string with source, origin, and nearby text; required for bare hash candidates"),
  },
  async execute(args, context) {
    let flagFile: string | undefined
    try {
      if (args.flagFile) flagFile = await resolveAllowedPath(args.flagFile, context, { allowSensitive: true })
      const input: VerifyCandidateFlagArgs = {
        candidates: parseCandidates(args.candidatesJson, args.candidate),
        expectedFlag: args.expectedFlag,
        flagFile,
        expectedFlagSha256: args.expectedFlagSha256,
        flagPattern: args.flagPattern,
        candidateContext: parseContext(args.candidateContextJson),
      }
      const result = await verifyCandidateFlag(input)
      const lines = [
        `status: ${result.status}`,
        `reason: ${result.reason}`,
        `oracle_verified: ${result.status === "oracle-verified"}`,
      ]
      if (result.matchedFlag) lines.push(`matched_flag: ${result.matchedFlag}`)
      if (result.matchedFlagSha256) lines.push(`matched_flag_sha256: ${result.matchedFlagSha256}`)
      if (result.status === "candidate") {
        lines.push("next: keep candidate_status=pending_oracle; do not stop or write agent_flag.txt")
      } else if (result.status === "oracle-verified") {
        lines.push("next: record the exact oracle evidence, then close the solve")
      }
      return lines.join("\n")
    } catch (error) {
      return `ERROR: ${error instanceof Error ? error.message : String(error)}`
    }
  },
})
