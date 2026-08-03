import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("facade-first guidance", () => {
  it("keeps core helper next-step text pointed at stable facades", () => {
    const safeExtract = readFileSync("tools/core/ctf-safe-extract.ts", "utf8")
    const imageInfo = readFileSync("tools/core/image-file-info.ts", "utf8")
    const scoutAgent = readFileSync("agents/ctf-scout.md", "utf8")
    const decomposeTask = readFileSync("tools/core/ctf-decompose-task.ts", "utf8")

    expect(safeExtract).toContain("run ctf-crypto-analyze on crypto/RSA candidates")
    expect(safeExtract).not.toContain("run ctf-rsa-probe on crypto/RSA candidates")
    expect(imageInfo).toContain("use ctf-forensics-analyze first")
    expect(scoutAgent).toContain("Prefer stable facade entries for first-tool selection")
    expect(decomposeTask).toContain('skills: ["ctf-forensics-analyze"]')
  })
})
