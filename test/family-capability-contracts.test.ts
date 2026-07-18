import { describe, expect, it } from "vitest"
import { AGENT_MCP_DEFAULTS } from "../src/agent-mcp-profiles.js"
import { CTF_FAMILIES, FAMILY_CAPABILITY_CONTRACTS, getFamilyCapabilityContract } from "../src/family-capability-contracts.js"
import { MCP_SERVER_REGISTRY } from "../src/mcp-server-registry.js"
import { ALL_TOOL_PACKS } from "../src/tool-packs.js"

const CATEGORY_AGENT_BY_FAMILY = {
  web: "ctf-web",
  pwn: "ctf-pwn",
  rev: "ctf-rev",
  crypto: "ctf-crypto",
  forensics: "ctf-forensics",
  misc: "ctf-misc",
} as const

describe("family capability contracts", () => {
  it("covers all supported CTF families", () => {
    expect(Object.keys(FAMILY_CAPABILITY_CONTRACTS).sort()).toEqual([...CTF_FAMILIES].sort())
  })

  it("returns the canonical contract by family", () => {
    for (const family of CTF_FAMILIES) {
      expect(getFamilyCapabilityContract(family)).toBe(FAMILY_CAPABILITY_CONTRACTS[family])
    }
  })

  it("references only valid tool packs", () => {
    const validPacks = new Set(ALL_TOOL_PACKS)
    for (const family of CTF_FAMILIES) {
      for (const pack of FAMILY_CAPABILITY_CONTRACTS[family].expectedToolPacks) {
        expect(validPacks.has(pack)).toBe(true)
      }
    }
  })

  it("references only registered MCP ids", () => {
    const registered = new Set(MCP_SERVER_REGISTRY.map((server) => server.id))
    for (const family of CTF_FAMILIES) {
      const contract = FAMILY_CAPABILITY_CONTRACTS[family]
      for (const serverId of [...contract.defaultMcps, ...contract.requestableHeavyMcps]) {
        expect(registered.has(serverId)).toBe(true)
      }
    }
  })

  it("keeps category-agent defaults aligned with contract defaults", () => {
    for (const family of CTF_FAMILIES) {
      const agent = CATEGORY_AGENT_BY_FAMILY[family]
      expect(AGENT_MCP_DEFAULTS[agent]).toEqual(FAMILY_CAPABILITY_CONTRACTS[family].defaultMcps)
    }
  })

  it("declares fallback modes, handoff contract, and readiness checks for every family", () => {
    for (const family of CTF_FAMILIES) {
      const contract = FAMILY_CAPABILITY_CONTRACTS[family]
      expect(contract.fallbackModes.length).toBeGreaterThan(0)
      expect(contract.handoffContract.owner.length).toBeGreaterThan(0)
      expect(contract.handoffContract.summary.length).toBeGreaterThan(0)
      expect(contract.handoffContract.escalationTriggers.length).toBeGreaterThan(0)
      expect(contract.readinessChecks.length).toBeGreaterThan(0)
    }
  })

  it("keeps benchmark coverage metadata populated for every family", () => {
    for (const family of CTF_FAMILIES) {
      const contract = FAMILY_CAPABILITY_CONTRACTS[family]
      expect(["covered", "partial", "planned"]).toContain(contract.benchmarkCoverage.status)
      expect(contract.benchmarkCoverage.benchmarkIds.length).toBeGreaterThan(0)
    }
  })
})
