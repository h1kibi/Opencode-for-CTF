import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { AGENT_MCP_DEFAULTS } from "../src/agent-mcp-profiles.js"
import { CTF_FAMILIES, FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"
import { FAST_TOOL_ALLOWLIST, SUBAGENT_LIGHT_TOOLS } from "../src/tool-packs.js"

const rule = readFileSync("rules/agent-equipment.md", "utf8")
const fastAgent = readFileSync("agents/ctf-fast.md", "utf8")

const familyAgentByFamily = {
  web: "ctf-web",
  pwn: "ctf-pwn",
  rev: "ctf-rev",
  crypto: "ctf-crypto",
  forensics: "ctf-forensics",
  misc: "ctf-misc",
} as const

describe("agent equipment rule", () => {
  it("declares all primary, category, meta, and support agents", () => {
    for (const agent of Object.keys(AGENT_MCP_DEFAULTS)) {
      expect(rule).toContain(agent)
    }
    expect(rule).toContain("researcher")
  })

  it("mentions runtime facts and startup pack behavior", () => {
    for (const source of [
      "src/tool-packs.ts",
      "src/family-capability-contracts.ts",
      "src/agent-mcp-profiles.ts",
      "src/mcp-server-registry.ts",
      "FAST_TOOL_ALLOWLIST",
      "tool_packs",
      "expert_tool_packs",
    ]) {
      expect(rule).toContain(source)
    }
  })

  it("keeps fast allowlist sentinel tools documented", () => {
    for (const toolName of [
      "ctf-route-plan",
      "ctf-evidence-board",
      "ctf-web-analyze",
      "ctf-web-blackbox-map",
      "ctf-pwn-analyze",
      "ctf-pwn-runner",
      "ctf-crypto-analyze",
      "ctf-rsa-probe",
      "ctf-forensics-analyze",
      "ctf-pcap-probe",
      "ctf-misc-analyze",
      "ctf-dynamic-mcp-advisor",
      "ctf-handoff",
    ]) {
      expect(FAST_TOOL_ALLOWLIST.has(toolName)).toBe(true)
      expect(rule).toContain(toolName)
    }
  })

  it("documents facade-first fast routing while keeping direct probes as fallbacks", () => {
    expect(rule).toContain("prefer the facade tools first")
    expect(rule).toContain("Facade routers")
    expect(rule).toContain("Focused fallback probes")
    expect(fastAgent).toContain("Rev/Crypto/取证/Misc 入口")
    expect(fastAgent).toContain("已分类后的 focused fallback")
    expect(fastAgent).toContain("`ctf-rev-analyze`, `ctf-crypto-analyze`, `ctf-forensics-analyze`, `ctf-misc-analyze`")
  })

  it("keeps category contracts represented by pack, MCP, and required tool names", () => {
    for (const family of CTF_FAMILIES) {
      const contract = FAMILY_CAPABILITY_CONTRACTS[family]
      const agent = familyAgentByFamily[family]
      expect(rule).toContain(agent)
      for (const pack of contract.expectedToolPacks) expect(rule).toContain(pack)
      for (const mcp of contract.defaultMcps) expect(rule).toContain(mcp)
      for (const toolName of contract.requiredTools) expect(rule).toContain(toolName)
    }
  })

  it("keeps subagent light tools represented by sentinel names", () => {
    const sentinels = {
      "ctf-web": ["ctf-web-fingerprint", "ctf-api-map"],
      "ctf-pwn": ["ctf-pwn-analyze", "ctf-pwn-probe"],
      "ctf-crypto": ["ctf-crypto-analyze", "ctf-proto-probe"],
      "ctf-forensics": ["ctf-forensics-analyze", "ctf-image-open"],
      "ctf-misc": ["ctf-misc-analyze", "ctf-python-inline"],
    } as const
    for (const [agent, tools] of Object.entries(sentinels)) {
      for (const toolName of tools) {
        expect(SUBAGENT_LIGHT_TOOLS[agent].has(toolName)).toBe(true)
        expect(rule).toContain(toolName)
      }
    }
  })
})
