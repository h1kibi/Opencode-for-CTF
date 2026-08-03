import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { AGENT_MCP_DEFAULTS } from "../src/agent-mcp-profiles.js"
import { agentNameToCategory } from "../src/dynamic-mcp-manager.js"
import { skillToAgent } from "../src/plugin-support.js"
import { TEAM_AGENTS } from "../src/team/team-types.js"
import {
  isCtfSubagent,
  SUBAGENT_LIGHT_TOOLS,
  toolAllowedForSubagent,
} from "../src/tool-packs.js"

const root = process.cwd()

describe("ctf-aisec specialist integration", () => {
  it("publishes the agent and orchestration skill", () => {
    const agentPath = join(root, "agents", "ctf-aisec.md")
    const skillPath = join(root, "skills", "ctf-aisec", "SKILL.md")
    expect(existsSync(agentPath)).toBe(true)
    expect(existsSync(skillPath)).toBe(true)

    const agent = readFileSync(agentPath, "utf8")
    expect(agent).toContain('"mode": "subagent"')
    expect(agent).toContain('"ctf-aisec": "allow"')
    expect(agent).toContain('"ctf-misc-ai-ml": "allow"')

    const skill = readFileSync(skillPath, "utf8")
    expect(skill).toContain("name: ctf-aisec")
    expect(skill).toContain("ctf-misc-ai-ml")
    expect(skill).toContain("metric_or_oracle")
  })

  it("registers aisec as a specialist without creating a new router family", () => {
    const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
      primary_agents: string[]
      category_subagents: string[]
    }
    expect(manifest.primary_agents).toEqual(["ctf-fast", "ctf-expert"])
    expect(manifest.category_subagents).toContain("ctf-aisec")
    expect(TEAM_AGENTS).toContain("ctf-aisec")
    expect(agentNameToCategory("ctf-aisec")).toBe("misc")
    expect(skillToAgent("ctf-aisec")).toBe("ctf-aisec")
    expect(skillToAgent("ctf-aisec-prompt-injection")).toBe("ctf-aisec")
  })

  it("keeps the default runtime and lightweight tool surface conservative", () => {
    expect(AGENT_MCP_DEFAULTS["ctf-aisec"]).toContain("browser")
    expect(isCtfSubagent("ctf-aisec")).toBe(true)
    expect(SUBAGENT_LIGHT_TOOLS["ctf-aisec"]).toBeDefined()
    expect(toolAllowedForSubagent("ctf-misc-analyze", "ctf-aisec")).toBe(true)
    expect(toolAllowedForSubagent("ctf-python-inline", "ctf-aisec")).toBe(true)
    expect(toolAllowedForSubagent("ctf-web-source-map", "ctf-aisec")).toBe(true)
    expect(toolAllowedForSubagent("ctf-local-harness-verifier", "ctf-aisec", ["core", "pwn-heavy"])).toBe(false)
    expect(toolAllowedForSubagent("ctf-web-runtime-map", "ctf-aisec", ["core", "web", "web-heavy"])).toBe(false)
  })
})
