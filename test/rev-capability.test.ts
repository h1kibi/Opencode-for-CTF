import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/rev/ctf-rev-capability-check.ts"

async function run(args: Record<string, unknown>) {
  const mod = await import(MOD_PATH)
  const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-capability-"))
  return {
    root,
    payload: JSON.parse(String(await mod.default.execute(args, { directory: root } as never))),
  }
}

describe("ctf-rev-capability-check tool", () => {
  it("returns a stable Mach-O capability schema without requiring a target", async () => {
    const { payload } = await run({ family: "mach-o", jsonOnly: true })

    expect(payload.schema_version).toBe("rev_capability.v1")
    expect(payload.family).toBe("mach-o")
    expect(["ok", "partial", "blocked", "pack-disabled"]).toContain(payload.status)
    expect(payload.host).toHaveProperty("os")
    expect(payload.host).toHaveProperty("docker")
    expect(payload.packs.rev).toHaveProperty("enabled")
    expect(payload.packs.rev).toHaveProperty("registered")
    expect(Array.isArray(payload.tools)).toBe(true)
    expect(payload.tools.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(["otool", "llvm-objdump", "objdump"]),
    )
    expect(payload.recommended_path).toHaveProperty("next_action")
  })

  it("returns Android/DEX probes and exposes pack state instead of assuming tools exist", async () => {
    const { payload } = await run({ family: "dex", jsonOnly: true })
    const names = payload.tools.map((item: { name: string }) => item.name)

    expect(payload.family).toBe("dex")
    expect(names).toEqual(expect.arrayContaining(["baksmali", "aapt", "adb"]))
    expect(payload.packs.android).toHaveProperty("requiredPack", "android")
    expect(payload.packs.android.internalTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "ctf-dex-patch-map" }),
        expect.objectContaining({ name: "ctf-android-native-triage" }),
      ]),
    )
    expect(payload.runtime).toHaveProperty("adb_device")
  })

  it("checks Unicorn Python modules without executing the supplied artifact", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-capability-"))
    const target = path.join(root, "sample.py")
    await writeFile(target, "raise SystemExit('must not execute')\n", "utf8")

    const out = await mod.default.execute({ family: "unicorn", target: "sample.py", jsonOnly: true }, {
      directory: root,
    } as never)
    const payload = JSON.parse(String(out))

    expect(payload.family).toBe("unicorn")
    expect(payload.python_modules.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(["unicorn", "capstone", "qiling"]),
    )
    expect(payload.target).toBe(target)
    expect(payload.blocking).not.toContain(expect.stringContaining("must not execute"))
  })

  it("lets rev-analyze opt into capability checks while keeping the default path lazy", async () => {
    const analyze = await import("../tools/rev/ctf-rev-analyze.ts")
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-capability-analyze-"))
    await writeFile(path.join(root, "challenge"), Buffer.from("\xfe\xed\xfa\xce\x00\x00\x00\x00", "binary"))

    const lazy = JSON.parse(
      String(await analyze.default.execute({ target: "challenge", jsonOnly: true }, { directory: root } as never)),
    )
    expect(lazy.capability_check).toBeNull()
    expect(lazy.skipped).toContain(
      "capability_check_skipped: set checkCapabilities=true to probe host tools and enabled packs",
    )

    const checked = JSON.parse(
      String(
        await analyze.default.execute({ target: "challenge", checkCapabilities: true, jsonOnly: true }, {
          directory: root,
        } as never),
      ),
    )
    expect(checked.capability_check.schema_version).toBe("rev_capability.v1")
    expect(checked.capability_check.family).toBe("mach-o")
    expect(checked.nextToolHint).toBe(checked.capability_check.recommended_path.next_action)
  })
})
