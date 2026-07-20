import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/ctf-pwn-fast-skeleton-hints.ts"

describe("ctf-pwn-fast-skeleton-hints tool", () => {
  it("returns unified decision fields for ret2win", async () => {
    const mod = await import(MOD_PATH)
    const execute = mod.default.execute as (args: Record<string, unknown>) => Promise<string>
    const text = await execute({ route: "ret2win", jsonOnly: true })
    const parsed = JSON.parse(text)
    expect(parsed.schema_version).toBe("pwn_fast_skeleton_hints.v1")
    expect(parsed.route_family).toBe("ret2win")
    expect(parsed.best_fast_path).toBeTruthy()
    expect(parsed.one_variable_probe).toBeTruthy()
    expect(parsed.recommended_next_action).toContain("ctf-pwn-template-init")
    expect(parsed.stop_if).toBeTruthy()
  })

  it("normalizes fmt alias to format", async () => {
    const mod = await import(MOD_PATH)
    const execute = mod.default.execute as (args: Record<string, unknown>) => Promise<string>
    const text = await execute({ route: "fmt", evidence: "full relro", jsonOnly: true })
    const parsed = JSON.parse(text)
    expect(parsed.route_family).toBe("format")
    expect(parsed.route_specific_warnings.join(" ")).toContain("Full RELRO")
  })
})
