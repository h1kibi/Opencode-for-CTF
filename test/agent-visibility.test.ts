import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function frontmatter(file: string) {
  const text = readFileSync(join(root, "agents", file), "utf8")
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error(`missing frontmatter delimiters: ${file}`)
  return match[1]
}

function categoryAgents() {
  const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
    category_subagents?: string[]
  }
  return manifest.category_subagents ?? []
}

describe("agent visibility", () => {
  it("declares only fast and expert as user-selectable solving agents", () => {
    const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
      primary_agents?: string[]
      user_selectable_agents?: string[]
    }
    expect(manifest.primary_agents).toEqual(["ctf-fast", "ctf-expert"])
    expect(manifest.user_selectable_agents).toEqual(manifest.primary_agents)
  })

  it("keeps fast and expert as visible primary solving agents", () => {
    for (const agent of ["ctf-fast.md", "ctf-expert.md"]) {
      expect(frontmatter(agent), agent).not.toMatch(/^"hidden":\s*true\s*$/m)
      expect(frontmatter(agent), agent).toMatch(/^"mode":\s*"primary"\s*$/m)
    }
  })

  it("hides category agents while keeping them available for expert delegation", () => {
    for (const agent of categoryAgents().map((agent) => `${agent}.md`)) {
      expect(frontmatter(agent), agent).toMatch(/^"hidden":\s*true\s*$/m)
      expect(frontmatter(agent), agent).toMatch(/^"mode":\s*"subagent"\s*$/m)
    }
  })
})
