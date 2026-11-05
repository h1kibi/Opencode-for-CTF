export type CtfCategory = "web" | "pwn" | "rev" | "crypto" | "forensics" | "misc"

export type CtfPhase =
  "triage" | "recon" | "attack-queue" | "focused-probe" | "primitive-lock" | "control-plane" | "final-chain" | "retro"

export type RiskBudget = {
  requests: number
  concurrency: number
  uploads: number
  botTriggers: number
}

export const DEFAULT_RISK_BUDGET: RiskBudget = {
  requests: 20,
  concurrency: 1,
  uploads: 2,
  botTriggers: 2,
}

export type AttackQueueScore = {
  value: number
  cost: number
  risk: number
  stability: number
  confidence: number
}

export function scoreAttackQueue(input: AttackQueueScore): number {
  return input.value + input.confidence + input.stability - input.cost - input.risk
}

export function clampScore(value: number): number {
  return Math.max(1, Math.min(5, value))
}

export { CASE_ROUTE_STATES, INACTIVE_ROUTE_STATE, type CaseRouteState } from "./route-state.ts"
export {
  COMMAND_SURFACE,
  decideRoute,
  formatRouteDecision,
  pickMode,
  probeFileMagic,
  probeFileTree,
  scoreCategories,
  type CategoryScore,
  type RouteDecision,
  type RouteInput,
  type SolveMode,
  type ToolPack,
} from "./router.ts"
export {
  REV_RUNTIME_STAGES,
  revRuntimeArtifactProvenanceIssues,
  revRuntimeEventHash,
  revRuntimeFingerprintVerification,
  revRuntimeHistoryVerification,
  revRuntimeOracleObservationIssues,
  revRuntimePromotion,
  revRuntimeSessionDigest,
  revRuntimeValueSha256,
  type RevRuntimeArtifact,
  type RevRuntimeDoctor,
  type RevRuntimeDoctorCheck,
  type RevRuntimeDoctorCheckStatus,
  type RevRuntimeDoctorRequirement,
  type RevRuntimeEvidenceAnchor,
  type RevRuntimeEvidenceAnchorStatus,
  type RevRuntimeEvent,
  type RevRuntimeFingerprint,
  type RevRuntimeFingerprintStatus,
  type RevRuntimeHistoryVerification,
  type RevRuntimeFamily,
  type RevRuntimeMarker,
  type RevRuntimeObservation,
  type RevRuntimeProvenanceIssue,
  type RevRuntimeProvenanceIssueCode,
  type RevRuntimeObservationContract,
  type RevRuntimeObservationRuntime,
  type RevRuntimeOracle,
  type RevRuntimeOracleContractInput,
  type RevRuntimeOracleStatus,
  type RevRuntimeSession,
  type RevRuntimeStage,
  type RevRuntimeSubstrate,
} from "./rev-runtime-session.ts"
export {
  BARE_HASH_PATTERN,
  BARE_HASH_REGEX,
  DEFAULT_FLAG_PATTERN,
  DEFAULT_FLAG_REGEX,
  HIGH_CONFIDENCE_FLAG_PATTERN,
  HIGH_CONFIDENCE_FLAG_REGEX,
  HIGH_CONFIDENCE_FLAG_REGEX_ONCE,
  UUID_FLAG_PATTERN,
  classifyFlagCandidate,
  extractFlagCandidates,
  findFlags,
  hasFlagSourceContext,
  type FlagCandidate,
  type FlagCandidateKind,
  type FlagConfidence,
  type FlagEvidenceContext,
} from "./flag-rules.ts"
