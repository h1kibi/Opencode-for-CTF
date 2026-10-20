import { describe, expect, it } from "vitest"

describe("ctf-misc-env-check tool", () => {
  it("returns a stable capability matrix in JSON mode", async () => {
    const mod = await import("../tools/misc/ctf-misc-env-check.ts")
    const out = await mod.default.execute({ jsonOnly: true }, {} as never)
    const payload = JSON.parse(String(out))
    const expectedCapabilities = [
      "core",
      "encoding",
      "protocol",
      "smt",
      "qr",
      "media",
      "dns",
      "rf",
      "game_vm",
      "stego_forensics",
    ]

    expect(payload.schemaVersion).toBe("misc_env.v1")
    expect(["ready", "degraded", "blocked"]).toContain(payload.overallStatus)
    expect(payload.capabilities.map((capability: { id: string }) => capability.id)).toEqual(expectedCapabilities)
    for (const capability of payload.capabilities) {
      expect(["ready", "degraded", "blocked"]).toContain(capability.status)
      expect(Array.isArray(capability.checks)).toBe(true)
      if (capability.id === "dns") expect(capability.fallbackGroups).toContainEqual(["python:dns", "dig", "nslookup"])
      if (capability.id === "qr")
        expect(capability.fallbackGroups).toContainEqual(["python:opencv", "python:pyzbar", "zbarimg"])
      for (const check of capability.checks) {
        expect(typeof check.ok).toBe("boolean")
        expect(typeof check.required).toBe("boolean")
        expect(typeof check.detail).toBe("string")
        expect(typeof check.hint).toBe("string")
      }
    }
  })

  it("keeps human output bounded and reports fallback guidance", async () => {
    const mod = await import("../tools/misc/ctf-misc-env-check.ts")
    const out = String(await mod.default.execute({ jsonOnly: false }, {} as never))

    expect(out).toContain("MISC_ENV_CHECK:")
    expect(out).toContain("- capabilities:")
    expect(out).toContain("- missing hints:")
    expect(out.length).toBeLessThan(20_000)
  })
})
