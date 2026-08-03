import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

function makeStoredZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const data = file.data

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)

    offset += local.length + name.length + data.length
  }

  const centralDir = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDir, eocd])
}

describe("ctf-android-runtime-doctor", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves APK paths against context.directory instead of process cwd", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-android-doctor-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-android-doctor-other-"))
    writeFileSync(
      join(workspace, "sample.apk"),
      makeStoredZip([{ name: "lib/x86_64/libx.so", data: Buffer.from("x") }]),
    )

    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({
      ok: true,
      exitCode: 0,
      output: "List of devices attached\n\n",
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/android/ctf-android-runtime-doctor.ts")
      const out = await mod.default.execute({ apk: "sample.apk", jsonOnly: true }, {
        directory: workspace,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))

      expect(payload.verdict).toBe("NO_DEVICE")
      expect(payload.target.apkAbis).toEqual(["x86_64"])
      expect(payload.target.abi).toBe("x86_64")
    } finally {
      process.chdir(prev)
    }

    expect(execSpy).toHaveBeenCalledOnce()
    expect(execSpy).toHaveBeenCalledWith("adb", ["devices"], undefined, 6000)
  })
})
