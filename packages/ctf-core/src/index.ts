export type CtfCategory = "web" | "pwn" | "rev" | "crypto" | "forensics" | "misc"

export type CtfPhase =
  | "triage"
  | "recon"
  | "attack-queue"
  | "focused-probe"
  | "primitive-lock"
  | "control-plane"
  | "final-chain"
  | "retro"

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
