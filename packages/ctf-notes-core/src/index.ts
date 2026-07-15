import { DEFAULT_RISK_BUDGET, type CtfCategory, type CtfPhase, type RiskBudget } from "../../ctf-core/src/index"

export type CtfState = {
  challenge: {
    name: string
    category: CtfCategory | "unknown"
    flagFormat: string
    target: string
  }
  phase: CtfPhase
  nextAction: string
  hypotheses: string[]
  confirmedPrimitives: string[]
  blockedPaths: string[]
  riskBudget: RiskBudget
}

export function createDefaultState(): CtfState {
  return {
    challenge: {
      name: "",
      category: "unknown",
      flagFormat: "",
      target: "",
    },
    phase: "triage",
    nextAction: "",
    hypotheses: [],
    confirmedPrimitives: [],
    blockedPaths: [],
    riskBudget: DEFAULT_RISK_BUDGET,
  }
}

export function renderInitialNotesTemplate(): string {
  return `# Challenge Summary\n\n- Name: \n- Category: \n- Flag format: \n- Target: \n\n# Phase\n\n- Current phase: triage\n- Next required action: \n\n# Hypothesis Table\n\n| Hypothesis | Evidence | Cost to Verify | Risk | Expected Gain | Keep/Drop |\n|---|---|---:|---:|---:|---|\n\n# Command Log\n\n| Purpose | Command | Key Output | Interpretation | Fallback |\n|---|---|---|---|---|\n`
}
