import { describe, expect, it } from "vitest"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.js"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"

const families = ["web", "pwn", "rev", "crypto", "forensics", "misc"] as const

describe("cross-reference integrity", () => {
  it("all family benchmark ids point to declared benchmark metadata", () => {
    const knownIds = new Set(benchmarkFamilies.map((entry) => `${entry.family}/${entry.name}`))
    const missing: string[] = []
    for (const family of families) {
      for (const benchmarkId of FAMILY_CAPABILITY_CONTRACTS[family].benchmarkCoverage.benchmarkIds) {
        if (!knownIds.has(benchmarkId)) missing.push(benchmarkId)
      }
    }
    expect(missing).toEqual([])
  })
})
