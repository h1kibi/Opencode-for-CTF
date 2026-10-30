import { describe, expect, it } from "vitest"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const context = { directory: process.cwd(), worktree: process.cwd() }

describe("tools that depend on an external runtime", () => {
  it("reports Android runtime equivalence from the real adb probe", async () => {
    const module = await import("../tools/android/ctf-android-runtime-doctor.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ jsonOnly: true }, context)
    const payload = JSON.parse(text)

    expect(payload.verdict).toBeTypeOf("string")
    expect(payload.target.abi).toBeTypeOf("string")
    expect(payload.equivalence).toMatchObject({
      abiEquivalent: expect.anything(),
      androidEquivalent: expect.anything(),
    })
    expect(payload.recommendedPath).toBeTypeOf("string")
  }, 60_000)

  it("returns an empty window list when no process matches the filter", async () => {
    const module = await import("../tools/rev/ctf-windows-gui-inspect.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ processName: "ctf-no-such-process-9f3a", jsonOnly: true }, context)

    expect(Array.isArray(JSON.parse(text))).toBe(true)
  }, 90_000)

  it("explains the next step when the window list is empty", async () => {
    const module = await import("../tools/rev/ctf-windows-gui-inspect.ts")
    const execute = module.default.execute as Execute

    const text = await execute({ processName: "ctf-no-such-process-9f3a", windowTitle: "ctf-none" }, context)

    expect(text).toContain("CTF_WINDOWS_GUI_INSPECT")
    expect(text).toContain("windows: 0")
    expect(text).toContain("launch_template")
  }, 90_000)
})
