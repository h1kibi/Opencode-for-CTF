import { describe, expect, it } from "vitest"
import { evaluateFamilyReadiness } from "../src/family-readiness.ts"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.ts"

describe("readiness environment probes", () => {
  it("reports unprobed environment dependencies as degraded or blocked", () => {
    const contract = FAMILY_CAPABILITY_CONTRACTS.pwn
    const report = evaluateFamilyReadiness({
      family: "pwn",
      registeredTools: contract.requiredTools,
      enabledToolPacks: ["core", "pwn"],
    })
    expect(report.missingCapabilities).toContain("env:docker")
    expect(["degraded", "blocked"]).toContain(report.status)
  })

  it("accepts a successful required environment probe", () => {
    const contract = FAMILY_CAPABILITY_CONTRACTS.pwn
    const report = evaluateFamilyReadiness({
      family: "pwn",
      registeredTools: contract.requiredTools,
      enabledToolPacks: ["core", "pwn"],
      environmentProbes: {
        "env:docker": { ok: true, behaviorOk: true, version: "27" },
        "env:pwnlab-images": { ok: true, behaviorOk: true },
        "env:pwntools": { ok: true, behaviorOk: true },
      },
    })
    expect(report.missingCapabilities).toEqual([])
  })
})
