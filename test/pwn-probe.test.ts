import { describe, expect, it, vi } from "vitest"

const MOD_PATH = "../tools/ctf-pwn-probe.ts"

describe("ctf-pwn-probe tool", () => {
  it("returns a unified local-binary probe summary", async () => {
    const mod = await import(MOD_PATH)
    const execute = mod.default.execute as (args: Record<string, unknown>, context: { directory: string }) => Promise<string>
    const text = await execute(
      { targetDir: "templates", binary: "templates/pwn_fast_ret2win.py", jsonOnly: true },
      { directory: "C:/Projects/Agent-projects/Opencode-for-CTF" },
    )
    const parsed = JSON.parse(text)
    expect(parsed.schema_version).toBe("pwn_probe.v1")
    expect(parsed.route_guess).toBeTruthy()
    expect(parsed.best_fast_path).toBeTruthy()
    expect(parsed.one_variable_probe).toBeTruthy()
    expect(parsed.recommended_next_action).toBeTruthy()
    expect(parsed.fallback_action).toBeTruthy()
    expect(parsed.escalate_if).toContain("ESCALATE")
  })

  it("returns remote behavior fields when host and port are supplied", async () => {
    const execUtils = await import("../tools/lib/exec-utils.ts")
    const execSpy = vi.spyOn(execUtils, "safeExecWithStreams").mockResolvedValue({
      stdout: JSON.stringify({ banner: "Welcome\n", body: "READY\n" }),
      stderr: "",
      ok: true,
      exitCode: 0,
    } as never)

    try {
      const mod = await import(MOD_PATH)
      const execute = mod.default.execute as (args: Record<string, unknown>, context: { directory: string }) => Promise<string>
      const text = await execute(
        { targetDir: "templates", binary: "templates/pwn_fast_ret2win.py", host: "127.0.0.1", port: 31337, jsonOnly: true },
        { directory: "C:/Projects/Agent-projects/Opencode-for-CTF" },
      )
      const parsed = JSON.parse(text)
      expect(parsed.remote_behavior).toBeTruthy()
      expect(parsed.remote_behavior.transport).toBeTruthy()
      expect(parsed.remote_behavior.powDetected).toBeTypeOf("boolean")
      expect(parsed.remote_behavior.binaryProtocolLikely).toBeTypeOf("boolean")
    } finally {
      execSpy.mockRestore()
    }
  })
})
