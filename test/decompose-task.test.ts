import { describe, expect, it } from "vitest"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

type Stream = {
  id: string
  name: string
  description: string
  skills: string[]
  canRunParallel: boolean
  dependsOn: string[]
  agentPrompt: string
}

type Plan = {
  challengeTag: string
  category: string
  phaseCount: number
  waves: Array<{ wave: number; synthesisQuestion: string; streams: Stream[] }>
  strategySummary: string
  riskBudget: Record<string, unknown>
}

const context = { directory: process.cwd(), worktree: process.cwd() }

async function plan(args: Record<string, unknown>): Promise<Plan> {
  const module = await import("../tools/core/ctf-decompose-task.ts")
  const execute = module.default.execute as Execute
  return JSON.parse(await execute(args, context)) as Plan
}

describe("ctf-decompose-task", () => {
  it("opens a web plan with three parallel recon streams", async () => {
    const out = await plan({ category: "web", target: "http://ctf.local:8080/" })

    expect(out.category).toBe("web")
    expect(out.phaseCount).toBe(3)
    expect(out.challengeTag).toContain("ctf-local-8080")
    expect(out.waves).toHaveLength(3)

    const first = out.waves[0]
    expect(first.streams).toHaveLength(3)
    for (const stream of first.streams) {
      expect(stream.canRunParallel).toBe(true)
      expect(stream.dependsOn).toEqual([])
      expect(stream.id.startsWith(out.challengeTag)).toBe(true)
      expect(stream.agentPrompt.length).toBeGreaterThan(0)
    }
    expect(first.streams.map((stream) => stream.name)).toContain("Black-box Recon")
    expect(first.streams.flatMap((stream) => stream.skills)).toContain("ctf-web")
  })

  it("makes each later wave depend on the streams before it", async () => {
    const out = await plan({ category: "web", target: "http://ctf.local:8080/" })
    const [first, second, third] = out.waves

    expect(second.streams.every((stream) => stream.dependsOn.length === first.streams.length)).toBe(true)
    expect(third.streams).toHaveLength(1)
    expect(third.streams[0].canRunParallel).toBe(false)
    expect(third.streams[0].dependsOn).toHaveLength(second.streams.length)
    expect(out.strategySummary.length).toBeGreaterThan(0)
    expect(out.riskBudget).toBeTypeOf("object")
  })

  it("tells the pwn triage stream which libc to compare against", async () => {
    const out = await plan({ category: "pwn", target: "./chall", binary: "./chall", libc: "./libc.so.6" })

    expect(out.category).toBe("pwn")
    const triage = out.waves[0].streams.find((stream) => stream.name === "Binary Triage")
    expect(triage).toBeDefined()
    expect(triage?.agentPrompt).toContain("checksec")
    expect(triage?.agentPrompt).toContain("./libc.so.6")
    expect(triage?.skills).toContain("ctf-pwn")
  })

  it("falls back to a two-wave plan for an unknown category", async () => {
    const out = await plan({ category: "nope", target: "x" })

    expect(out.category).toBe("nope")
    expect(out.phaseCount).toBe(2)
    expect(out.waves).toHaveLength(2)
  })
})
