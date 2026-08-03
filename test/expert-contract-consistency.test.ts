import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCtfEntryInjection } from "../src/route-runtime.ts"
import { DEFAULT_PLUGIN_CONFIG } from "../src/plugin-config.ts"

const skillPath = resolve("skills", "ctf-expert", "SKILL.md")
const agentPath = resolve("agents", "ctf-expert.md")
const commandPath = resolve("commands", "ctf-expert.md")
const ctfCommandPath = resolve("commands", "ctf.md")
const routeRuntimePath = resolve("src", "route-runtime.ts")
const manifestPath = resolve("ctf-agent.manifest.json")
const readmePath = resolve("README.md")

function read(file: string) {
  return readFileSync(file, "utf8")
}

function expectCoreExpertInvariants(text: string) {
  expect(text).toMatch(/exactly\s+3/i)
  expect(text).toMatch(/untested/i)
  expect(text).toMatch(/blocked/i)
  expect(text).toMatch(/dead/i)
  expect(text).toMatch(/live/i)
  expect(text).toMatch(/researcher/i)
}

describe("expert contract consistency", () => {
  it("keeps the core three-route and four-state contract across skill, agent, command, and /ctf surfaces", () => {
    const skill = read(skillPath)
    const agent = read(agentPath)
    const command = read(commandPath)
    const ctfCommand = read(ctfCommandPath)

    for (const text of [skill, agent, command]) {
      expectCoreExpertInvariants(text)
    }

    expect(ctfCommand).toMatch(/BINDING/i)
    expect(ctfCommand).toMatch(/ctf-handoff lane=expert/i)
    expect(ctfCommand).toMatch(/Evidence\.md/i)
    expect(ctfCommand).toMatch(/exactly\s+3/i)

    expect(skill).toMatch(/blocked\s*≠\s*dead/i)
    expect(agent).toMatch(/blocked\s*≠\s*dead/i)
    expect(command).toMatch(/blocked\s*≠\s*dead/i)
  })

  it("keeps the Phase 2 local recall contract across expert surfaces", () => {
    const skill = read(skillPath)
    const agent = read(agentPath)
    const command = read(commandPath)

    for (const text of [skill, agent, command]) {
      expect(text).toMatch(/ctf-lesson-search/i)
      expect(text).toMatch(/ctf-retro-search/i)
      expect(text).toMatch(/ctf-pattern-card-search/i)
      expect(text).toMatch(/ctf-pattern-to-hypothesis/i)
    }
  })

  it("keeps direct flag return and manual researcher handoff across expert surfaces", () => {
    const skill = read(skillPath)
    const agent = read(agentPath)
    const command = read(commandPath)

    for (const text of [skill, agent, command]) {
      expect(text).toMatch(/return (the )?flag/i)
      expect(text).toMatch(/researcher/i)
    }

    expect(skill).toMatch(/do not dispatch researcher automatically|do not automatically dispatch researcher/i)
    expect(agent).toMatch(/do not dispatch or await it|do not dispatch or await researcher/i)
    expect(command).toMatch(/do not dispatch or await researcher/i)
  })

  it("keeps runtime and generated /ctf injection text aligned with the expert contract", () => {
    const routeRuntime = read(routeRuntimePath)
    const injection = buildCtfEntryInjection({
      userText: "complex jwt trust boundary challenge",
      config: { ...DEFAULT_PLUGIN_CONFIG, default_mode: "expert" },
    }).text

    for (const text of [routeRuntime, injection]) {
      expect(text).toMatch(/Behave as \*\*ctf-expert\*\*/i)
      expect(text).toMatch(/ctf-evidence-board command=init/i)
      expect(text).toMatch(/lessons → retros → knowledge recall/i)
      expect(text).toMatch(/exactly 3/i)
      expect(text).toMatch(/blocked ≠ dead/i)
      expect(text).toMatch(/Flag → return immediately/i)
      expect(text).toMatch(/manual `researcher`/i)
    }
  })

  it("keeps manifest and README-level entrypoint/agent taxonomy aligned with the expert contract", () => {
    const manifest = JSON.parse(read(manifestPath)) as {
      default_entrypoints: string[]
      primary_agents: string[]
      support_primary_agents: string[]
    }
    const readme = read(readmePath)

    expect(manifest.default_entrypoints).toContain("/ctf")
    expect(manifest.default_entrypoints).toContain("/ctf-expert")
    expect(manifest.primary_agents).toEqual(["ctf-fast", "ctf-expert"])
    expect(manifest.support_primary_agents).toContain("researcher")

    for (const text of [readme]) {
      expect(text).toMatch(/ctf-fast/i)
      expect(text).toMatch(/ctf-expert/i)
      expect(text).toMatch(/researcher/i)
    }
  })
})
