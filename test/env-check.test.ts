import { describe, expect, it } from "vitest"
import envCheck from "../tools/ctf-env-check.ts"

type ToolResult = string | { output?: string }

type ToolContext = Parameters<typeof envCheck.execute>[1]

function extractOutput(result: ToolResult): string {
  if (typeof result === "string") return result
  return result.output || ""
}

function makeContext(): ToolContext {
  return {} as ToolContext
}

describe("ctf-env-check startup summary", () => {
  it("returns startup environment probes in json mode", async () => {
    const result = (await envCheck.execute(
      { category: "all", jsonOnly: true },
      makeContext(),
    )) as ToolResult
    const parsed = JSON.parse(extractOutput(result)) as {
      environment_probes: Record<string, { executed?: boolean }>
    }

    expect(parsed.environment_probes["env:os"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:shell"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:kali"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:wsl"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:wiremcp-launcher"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:cyberchef-mcp"]?.executed).toBe(true)
    expect(parsed.environment_probes["env:ida-pro-mcp"]?.executed).toBe(true)
  }, 60_000)

  it("prints a startup environment summary in text mode", async () => {
    const result = (await envCheck.execute({ category: "all" }, makeContext())) as ToolResult
    const text = extractOutput(result)
    expect(text).toContain("Startup environment:")
    expect(text).toContain("os=")
    expect(text).toContain("shell=")
    expect(text).toContain("substrate=")
    expect(text).toContain("MCP OBSERVABILITY HINTS")
  }, 60_000)
})
