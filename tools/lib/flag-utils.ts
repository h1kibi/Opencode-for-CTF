/**
 * Compatibility facade for the canonical flag rules in ctf-core.
 * New code should import from packages/ctf-core/src/flag-rules.ts directly.
 */
export {
  BARE_HASH_PATTERN,
  BARE_HASH_REGEX,
  DEFAULT_FLAG_PATTERN,
  DEFAULT_FLAG_REGEX,
  FLAG_PATTERN,
  FLAG_REGEX,
  FLAG_REGEX_ONCE,
  HIGH_CONFIDENCE_FLAG_PATTERN,
  UUID_FLAG_PATTERN,
  classifyFlagCandidate,
  extractFlagCandidates,
  findFlags,
  hasFlagSourceContext,
  type FlagCandidate,
  type FlagCandidateKind,
  type FlagConfidence,
  type FlagEvidenceContext,
} from "../../packages/ctf-core/src/flag-rules.ts"
