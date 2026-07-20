import { describe, expect, it, vi } from "vitest"

const MOD_PATH = "../tools/ctf-pwn-remote-fingerprint.ts"

describe("ctf-pwn-remote-check contract", () => {
  it("returns unified fast-lane decision fields", async () => {
    const mod = await import(MOD_PATH)
    const execUtils = await import("../tools/lib/exec-utils.ts")
    const spy = vi.spyOn(execUtils, "safeExecWithStreams").mockResolvedValue({
      stdout: [
        JSON.stringify({ name: "baseline", banner: "Welcome\n", expect_data: "", body: "READY\n", status: "ok", error: "", send_size: 0, flags: [] }),
        JSON.stringify({ name: "mutant", banner: "Welcome\n", expect_data: "", body: "READY2\n", status: "ok", error: "", send_size: 4, flags: [] }),
      ].join("\n"),
      stderr: "",
      ok: true,
      exitCode: 0,
    } as never)
    try {
      const execute = mod.default.execute as (args: Record<string, unknown>) => Promise<string>
      const text = await execute({ host: "127.0.0.1", port: 31337, jsonOnly: true })
      const parsed = JSON.parse(text)
      expect(parsed.transport).toBeTruthy()
      expect(parsed.best_fast_path).toBeTruthy()
      expect(parsed.one_variable_probe).toBeTruthy()
      expect(parsed.recommended_next_action).toBeTruthy()
      expect(parsed.fallback_action).toBeTruthy()
      expect(parsed.stop_if).toContain("ESCALATE")
    } finally {
      spy.mockRestore()
    }
  })
})
