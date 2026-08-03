import {
  evaluateAllFamilyReadiness,
  evaluateFamilyReadiness,
  formatFamilyReadinessSummary,
  type EnvironmentProbeResult,
  type FamilyReadinessReport,
} from "../family-readiness.ts"

export type FamilyCapabilityMatrix = {
  reports: FamilyReadinessReport[]
  ready: string[]
  degraded: string[]
  blocked: string[]
}

export function buildFamilyCapabilityMatrix(args: {
  registeredTools: Iterable<string>
  enabledToolPacks: string[]
  environmentProbes?: Record<string, EnvironmentProbeResult>
}): FamilyCapabilityMatrix {
  const reports = evaluateAllFamilyReadiness(args)
  return {
    reports,
    ready: reports.filter((report) => report.status === "ready").map((report) => report.family),
    degraded: reports.filter((report) => report.status === "degraded").map((report) => report.family),
    blocked: reports.filter((report) => report.status === "blocked").map((report) => report.family),
  }
}

export function summarizeFamilyCapabilityMatrix(matrix: FamilyCapabilityMatrix): string {
  return matrix.reports.map((report) => formatFamilyReadinessSummary(report)).join("\n\n")
}

export { evaluateFamilyReadiness }
