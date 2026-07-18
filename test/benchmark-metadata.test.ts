import { describe, expect, it } from "vitest"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.js"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"

const families = ["web", "pwn", "rev", "crypto", "forensics", "misc"] as const

describe("benchmark metadata", () => {
  it("covers every family with route and fallback metadata", () => {
    const coveredFamilies = new Set(benchmarkFamilies.map((entry) => entry.family))
    for (const family of families) {
      expect(coveredFamilies.has(family)).toBe(true)
      const entries = benchmarkFamilies.filter((entry) => entry.family === family)
      expect(entries.length).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(entry.name.length).toBeGreaterThan(0)
        expect(entry.description.length).toBeGreaterThan(0)
        expect(entry.routeClass).toBeDefined()
        expect(entry.fallbackExpectation).toBeDefined()
        expect(entry.evidenceExpectation).toBeDefined()
        expect(entry.benchmarkStatus).toBeDefined()
      }
    }
  })

  it("keeps benchmark metadata aligned with family readiness coverage labels", () => {
    const indexed = new Map(benchmarkFamilies.map((entry) => [`${entry.family}/${entry.name}`, entry.benchmarkStatus]))
    for (const family of families) {
      for (const benchmarkId of FAMILY_CAPABILITY_CONTRACTS[family].benchmarkCoverage.benchmarkIds) {
        const status = indexed.get(benchmarkId)
        expect(status).toBeDefined()
        expect(status).toBe(FAMILY_CAPABILITY_CONTRACTS[family].benchmarkCoverage.status)
      }
    }
  })
})
