import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadCtfTools } from "../src/ctf-tools.js"
import { FAMILY_CAPABILITY_CONTRACTS } from "../src/family-capability-contracts.js"
import {
  DEFAULT_TOOL_PACKS,
  FAST_TOOL_ALLOWLIST,
  SUBAGENT_LIGHT_TOOLS,
  ALL_TOOL_PACKS,
  packForTool,
  resolveEnabledPacks,
  toolAllowedByPacks,
} from "../src/tool-packs.js"

describe("tool registration contract", () => {
  it("exports every ctf-fast allowlisted tool under default packs", async () => {
    const tools = await loadCtfTools({ packs: DEFAULT_TOOL_PACKS })
    const exported = new Set(Object.keys(tools))
    for (const toolName of FAST_TOOL_ALLOWLIST) {
      expect(exported.has(toolName), `${toolName} should be exported`).toBe(true)
      expect(toolAllowedByPacks(toolName, resolveEnabledPacks(DEFAULT_TOOL_PACKS)), `${toolName} pack`).toBe(true)
    }
  }, 60_000)

  it("exports every subagent lightweight tool under default packs", async () => {
    const tools = await loadCtfTools({ packs: DEFAULT_TOOL_PACKS })
    const exported = new Set(Object.keys(tools))
    for (const [agent, toolNames] of Object.entries(SUBAGENT_LIGHT_TOOLS)) {
      for (const toolName of toolNames) {
        expect(exported.has(toolName), `${agent} lightweight tool missing: ${toolName}`).toBe(true)
        expect(
          toolAllowedByPacks(toolName, resolveEnabledPacks(DEFAULT_TOOL_PACKS)),
          `${agent} lightweight tool pack disabled: ${toolName} (${packForTool(toolName)})`,
        ).toBe(true)
      }
    }
  }, 60_000)

  it("keeps agent-declared default tools aligned with subagent gates", async () => {
    const allTools = await loadCtfTools({ packs: ALL_TOOL_PACKS })
    const allToolNames = new Set(Object.keys(allTools))
    const defaultPacks = resolveEnabledPacks(DEFAULT_TOOL_PACKS)
    const mismatches: string[] = []

    for (const [agent, lightTools] of Object.entries(SUBAGENT_LIGHT_TOOLS)) {
      const agentPath = join(process.cwd(), "agents", `${agent}.md`)
      const text = readFileSync(agentPath, "utf8")
      const declared = [
        ...new Set([...text.matchAll(/"(ctf-[a-z0-9-]+)"\s*:\s*"allow"/g)].map((match) => match[1])),
      ].sort()

      for (const toolName of declared) {
        if (!allToolNames.has(toolName)) continue
        if (!toolAllowedByPacks(toolName, defaultPacks)) continue

        if (!lightTools.has(toolName)) {
          mismatches.push(`${agent} declares ${toolName}, but subagent gate blocks it`)
        }
      }
    }

    expect(mismatches).toEqual([])
  }, 60_000)

  it("exports every family required/support tool under its declared packs", async () => {
    for (const [family, contract] of Object.entries(FAMILY_CAPABILITY_CONTRACTS)) {
      const tools = await loadCtfTools({ packs: contract.expectedToolPacks })
      const exported = new Set(Object.keys(tools))
      for (const toolName of [...contract.requiredTools, ...contract.supportTools]) {
        expect(exported.has(toolName), `${family} contract tool missing: ${toolName}`).toBe(true)
        expect(
          toolAllowedByPacks(toolName, resolveEnabledPacks(contract.expectedToolPacks)),
          `${family} contract tool pack disabled: ${toolName} (${packForTool(toolName)})`,
        ).toBe(true)
      }
    }
  }, 60_000)
})
