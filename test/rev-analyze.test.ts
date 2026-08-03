import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/rev/ctf-rev-analyze.ts"

describe("ctf-rev-analyze tool", () => {
  it("routes APKs to the android facade hint without native probing", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-analyze-"))
    const target = path.join(root, "challenge.apk")
    await writeFile(target, Buffer.from("PK\x03\x04fixture"), "binary")

    const out = await mod.default.execute({ target: "challenge.apk", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.route).toBe("apk")
    expect(payload.probe).toBeNull()
    expect(payload.slice).toBeNull()
    expect(payload.nextToolHint).toContain("ctf-android-analyze")
    expect(payload.skipped).toContain("binary_probe_skipped: apk is better handled by an artifact-specific facade")
  })

  it("routes PE-like files to the native facade path", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-analyze-"))
    const target = path.join(root, "crackme.exe")
    await writeFile(target, Buffer.from("MZfixture"), "binary")

    const out = await mod.default.execute({ target: "crackme.exe", slice: false, jsonOnly: true }, {
      directory: root,
    } as never)
    const payload = JSON.parse(String(out))

    expect(payload.route).toBe("pe")
    expect(String(payload.probe)).toContain("verdict:")
    expect(String(payload.probe)).toContain("crackme.exe")
    expect(payload.slice).toBeNull()
    expect(payload.skipped).toContain("slice_skipped: slice=false")
  })

  it("routes Mach-O artifacts with an explicit capability contract", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-analyze-"))
    await writeFile(path.join(root, "challenge"), Buffer.from("\xfe\xed\xfa\xce\x00\x00\x00\x00", "binary"))

    const out = await mod.default.execute({ target: "challenge", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.route).toBe("mach-o")
    expect(payload.fingerprint).toEqual({ family: "mach-o", confidence: "high", detectedBy: "Mach-O magic" })
    expect(payload.capability).toEqual({
      selectedTool: "otool / llvm-objdump / Ghidra fallback",
      requiredPack: "rev",
      availability: "external-or-local",
    })
    expect(payload.nextToolHint).toContain("otool/llvm-objdump")
    expect(payload.probe).toBeNull()
  })

  it("routes DEX magic and secondary classes files to the Android capability", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-analyze-"))

    await writeFile(path.join(root, "classes.dex"), Buffer.from("dex\n035\x00fixture", "binary"))
    const dexOut = await mod.default.execute({ target: "classes.dex", jsonOnly: true }, { directory: root } as never)
    const dexPayload = JSON.parse(String(dexOut))
    expect(dexPayload.route).toBe("dex")
    expect(dexPayload.fingerprint.detectedBy).toBe("DEX magic or classes*.dex filename")
    expect(dexPayload.capability.selectedTool).toContain("ctf-dex-patch-map")
    expect(dexPayload.capability.requiredPack).toBe("android")
    expect(dexPayload.nextToolHint).toContain("ctf-android-native-triage")

    await writeFile(path.join(root, "classes2.dex"), Buffer.from("not-a-dex", "utf8"))
    const secondaryOut = await mod.default.execute({ target: "classes2.dex", jsonOnly: true }, {
      directory: root,
    } as never)
    const secondaryPayload = JSON.parse(String(secondaryOut))
    expect(secondaryPayload.route).toBe("dex")
    expect(secondaryPayload.fingerprint.confidence).toBe("high")
  })

  it("routes JVM class magic independently of the file extension", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-rev-analyze-"))
    await writeFile(path.join(root, "blob.bin"), Buffer.from("\xca\xfe\xba\xbe\x00\x00", "binary"))

    const out = await mod.default.execute({ target: "blob.bin", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.route).toBe("java")
    expect(payload.fingerprint.detectedBy).toBe("JVM class magic")
    expect(payload.capability).toEqual({
      selectedTool: "ctf-java-analyze",
      requiredPack: "core",
      availability: "available",
    })
    expect(payload.nextToolHint).toContain("ctf-java-analyze")
  })
})
