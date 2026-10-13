import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseDocument } from "yaml"

const root = process.cwd()
const agentsDir = join(root, "agents")

type AgentDefinition = {
  mode?: string
  hidden?: boolean
}

function frontmatter(file: string) {
  const text = readFileSync(join(agentsDir, file), "utf8")
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error(`missing frontmatter delimiters: ${file}`)
  return match[1]
}

function agentDefinition(file: string): AgentDefinition {
  const document = parseDocument(frontmatter(file), { prettyErrors: false, uniqueKeys: true })
  expect(document.errors, `invalid YAML frontmatter: ${file}`).toEqual([])
  return document.toJS() as AgentDefinition
}

function manifest() {
  return JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
    primary_agents?: string[]
    user_selectable_agents?: string[]
    category_subagents?: string[]
    meta_subagents?: string[]
  }
}

function categoryAgents() {
  return manifest().category_subagents ?? []
}

function hiddenSubagents() {
  const allAgents = readdirSync(agentsDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""))
  const primaryAgents = manifest().primary_agents ?? []
  return allAgents.filter((agent) => !primaryAgents.includes(agent))
}

describe("agent visibility", () => {
  it("declares only fast and expert as user-selectable solving agents", () => {
    expect(manifest().primary_agents).toEqual(["ctf-fast", "ctf-expert"])
    expect(manifest().user_selectable_agents).toEqual(manifest().primary_agents)
  })

  it("keeps fast and expert as visible primary solving agents", () => {
    for (const agent of ["ctf-fast.md", "ctf-expert.md"]) {
      const definition = agentDefinition(agent)
      expect(definition.mode, agent).toBe("primary")
      expect(definition.hidden, agent).not.toBe(true)
    }
  })

  it("parses every installed agent frontmatter as valid YAML", () => {
    for (const agent of readdirSync(agentsDir).filter((file) => file.endsWith(".md"))) {
      agentDefinition(agent)
    }
  })

  it("hides category and internal agents while keeping them available for expert delegation", () => {
    for (const agent of hiddenSubagents().map((agent) => `${agent}.md`)) {
      const definition = agentDefinition(agent)
      expect(definition.hidden, agent).toBe(true)
      expect(definition.mode, agent).toBe("subagent")
    }
  })
})
