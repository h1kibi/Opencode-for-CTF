import { describe, expect, it } from "vitest"
import { evaluateAllFamilyReadiness, evaluateFamilyReadiness, formatFamilyReadinessSummary } from "../src/family-readiness.js"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"
import { AGENT_MCP_DEFAULTS } from "../src/agent-mcp-profiles.js"

function registeredFor(family: keyof typeof FAMILY_CAPABILITY_CONTRACTS): string[] {
  const contract = FAMILY_CAPABILITY_CONTRACTS[family]
  return [...contract.requiredTools, ...contract.supportTools]
}

describe("family readiness", () => {
  it("reports ready when required packs, tools, and MCP defaults are present", () => {
    const report = evaluateFamilyReadiness({
      family: "web",
      registeredTools: registeredFor("web"),
      enabledToolPacks: ["core", "web"],
    })
    expect(report.status).toBe("ready")
    expect(report.missingRequiredTools).toEqual([])
    expect(report.missingToolPacks).toEqual([])
    expect(report.missingDefaultMcps).toEqual([])
  })

  it("reports blocked when a required family pack is missing", () => {
    const report = evaluateFamilyReadiness({
      family: "crypto",
      registeredTools: registeredFor("crypto"),
      enabledToolPacks: ["core"],
    })
    expect(report.status).toBe("blocked")
    expect(report.missingToolPacks).toContain("crypto")
  })

  it("reports blocked when a required tool is missing", () => {
    const report = evaluateFamilyReadiness({
      family: "pwn",
      registeredTools: ["ctf-binary-probe"],
      enabledToolPacks: ["core", "pwn"],
    })
    expect(report.status).toBe("blocked")
    expect(report.missingRequiredTools).toContain("ctf-pwn-runner")
  })

  it("reports degraded when only support tools are missing", () => {
    const contract = FAMILY_CAPABILITY_CONTRACTS.rev
    const report = evaluateFamilyReadiness({
      family: "rev",
      registeredTools: [...contract.requiredTools],
      enabledToolPacks: ["core", "rev"],
    })
    expect(report.status).toBe("degraded")
    expect(report.missingSupportTools.length).toBeGreaterThan(0)
  })

  it("reports blocked when contract defaults drift from agent defaults", () => {
    const original = AGENT_MCP_DEFAULTS["ctf-misc"]
    AGENT_MCP_DEFAULTS["ctf-misc"] = ["filesystem"]
    try {
      const report = evaluateFamilyReadiness({
        family: "misc",
        registeredTools: registeredFor("misc"),
        enabledToolPacks: ["core", "misc"],
      })
      expect(report.status).toBe("blocked")
      expect(report.missingDefaultMcps).toContain("context7")
    } finally {
      AGENT_MCP_DEFAULTS["ctf-misc"] = original
    }
  })

  it("evaluates all families in one pass", () => {
    const reports = evaluateAllFamilyReadiness({
      registeredTools: Object.values(FAMILY_CAPABILITY_CONTRACTS).flatMap((contract) => [
        ...contract.requiredTools,
        ...contract.supportTools,
      ]),
      enabledToolPacks: ["core", "web", "pwn", "rev", "crypto", "forensics", "misc", "java"],
    })
    expect(reports).toHaveLength(6)
    expect(reports.every((report) => ["ready", "degraded", "blocked"].includes(report.status))).toBe(true)
  })

  it("formats compact family readiness summaries", () => {
    const report = evaluateFamilyReadiness({
      family: "forensics",
      registeredTools: ["ctf-pcap-probe"],
      enabledToolPacks: ["core", "forensics"],
    })
    const text = formatFamilyReadinessSummary(report)
    expect(text).toContain("[forensics]")
    expect(text).toContain("missing required tools")
  })
})
