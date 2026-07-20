import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/ctf-pwn-offset.ts"

describe("ctf-pwn-offset tool", () => {
  it("returns a pattern when no crash value is supplied", async () => {
    const mod = await import(MOD_PATH)
    const out = await mod.default.execute({ length: 32 }, {} as never)
    expect(out).toContain("PWN_OFFSET")
    expect(out).toContain("offset: unknown")
    expect(out).toContain("pattern_length: 32")
  })

  it("resolves a 32-bit crash value into an offset", async () => {
    const mod = await import(MOD_PATH)
    const json = await mod.default.execute({ length: 128, bits: 32, crashValue: "0x31614130", jsonOnly: true }, {} as never)
    const parsed = JSON.parse(json)
    expect(parsed.offset).toBe(2)
    expect(parsed.offset_width_bytes).toBe(4)
    expect(parsed.ip_control_judgement).toBe("eip_pattern_match")
  })

  it("resolves a 64-bit crash value and marks partial-width matches", async () => {
    const mod = await import(MOD_PATH)
    const json = await mod.default.execute({ length: 128, bits: 64, crashValue: "0x31614130", jsonOnly: true }, {} as never)
    const parsed = JSON.parse(json)
    expect(parsed.offset).toBe(2)
    expect(parsed.offset_width_bytes).toBe(4)
    expect(parsed.ip_control_judgement).toBe("partial_rip_match_only")
  })
})
