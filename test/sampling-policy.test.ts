import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseDocument } from "yaml"
import { EXPLORER_AGENTS, handleChatParams, samplingClassForAgent } from "../src/hooks/chat-and-diagnostic-hooks.ts"

const root = process.cwd()
const agentsDir = join(root, "agents")

function frontmatter(file: string): Record<string, unknown> {
  const text = readFileSync(join(agentsDir, file), "utf8")
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) throw new Error(`missing frontmatter: ${file}`)
  const document = parseDocument(match[1], { prettyErrors: false, uniqueKeys: true })
  expect(document.errors, `invalid YAML frontmatter: ${file}`).toEqual([])
  return document.toJS() as Record<string, unknown>
}

async function effective(agent: string, declared: Record<string, unknown>) {
  const output: { temperature?: number | null; topP?: number | null } = {
    temperature: typeof declared.temperature === "number" ? declared.temperature : null,
    topP: typeof declared.top_p === "number" ? declared.top_p : null,
  }
  await handleChatParams({
    meta: { agent },
    output,
    isHookEnabled: () => true,
  })
  return output
}

describe("sampling policy contract (frontmatter <-> hook)", () => {
  it("honors every declared frontmatter temperature/top_p exactly", async () => {
    // The old clamp silently rewrote declared values (ctf-fast top_p 0.7 -> 0.1).
    // Declared values are the source of truth now; this pins it.
    for (const file of readdirSync(agentsDir).filter((f) => f.startsWith("ctf-") && f.endsWith(".md"))) {
      const agent = file.replace(/\.md$/, "")
      const declared = frontmatter(file)
      const result = await effective(agent, declared)
      if (typeof declared.temperature === "number") {
        expect(result.temperature, `${agent} temperature`).toBe(declared.temperature)
      }
      if (typeof declared.top_p === "number") {
        expect(result.topP, `${agent} top_p`).toBe(declared.top_p)
      }
    }
  })

  it("fills role-class defaults only when a value is undeclared", async () => {
    const explorer = await effective("ctf-web", {})
    expect(explorer.temperature).toBe(0.8)
    expect(explorer.topP).toBe(0.95)

    const commit = await effective("ctf-expert", {})
    expect(commit.temperature).toBe(0.2)
    expect(commit.topP).toBe(0.1)
  })

  it("keeps explorers diverse and committers near-greedy (exact declared values)", () => {
    // Exact per-agent expectation table: any change to a declared sampling
    // value must show up as an explicit diff here, not slip through a range.
    const expectedDeclared: Record<string, { temperature?: number; top_p?: number }> = {
      "ctf-expert": { temperature: 0, top_p: 0.1 },
      "ctf-fast": { temperature: 0.3, top_p: 0.7 },
      "ctf-oracle": { temperature: 0, top_p: 0.1 },
      "ctf-verifier": { temperature: 0, top_p: 0.1 },
      "ctf-librarian": { temperature: 0, top_p: 0.1 },
      "ctf-web": { temperature: 0.8, top_p: 0.95 },
      "ctf-pwn": { temperature: 0.8, top_p: 0.95 },
      "ctf-rev": { temperature: 0.8, top_p: 0.95 },
      "ctf-crypto": { temperature: 0.8, top_p: 0.95 },
      "ctf-forensics": { temperature: 0.8, top_p: 0.95 },
      "ctf-misc": { temperature: 0.8, top_p: 0.95 },
      "ctf-aisec": { temperature: 0.8, top_p: 0.95 },
      "ctf-pwn-fast": { temperature: 0.8, top_p: 0.95 },
      "ctf-scout": { temperature: 0.8, top_p: 0.95 },
    }
    for (const [agent, values] of Object.entries(expectedDeclared)) {
      const declared = frontmatter(`${agent}.md`)
      for (const [key, value] of Object.entries(values)) {
        expect(declared[key], `${agent} ${key}`).toBe(value)
      }
      // camelCase variants must not appear — they would silently bypass the contract.
      expect(declared, `${agent} must not declare camelCase sampling keys`).not.toHaveProperty("topP")
      expect(declared, `${agent} temperature key`).toHaveProperty("temperature")
    }
    for (const committer of ["ctf-expert", "ctf-fast", "ctf-oracle", "ctf-verifier", "ctf-librarian"]) {
      expect(samplingClassForAgent(committer), committer).toBe("commit")
    }
    for (const agent of EXPLORER_AGENTS) {
      expect(samplingClassForAgent(agent), agent).toBe("explorer")
    }
  })

  it("honors configurable explorer defaults", async () => {
    const output: { temperature?: number | null; topP?: number | null } = { temperature: null, topP: null }
    await handleChatParams({
      meta: { agent: "ctf-web" },
      output,
      isHookEnabled: () => true,
      explorerDefaults: { temperature: 0.5, top_p: 0.8 },
    })
    expect(output.temperature).toBe(0.5)
    expect(output.topP).toBe(0.8)
  })
})
