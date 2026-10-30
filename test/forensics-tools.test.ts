import { writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"
import { rm } from "node:fs/promises"

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
)

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

describe("forensics artifact tools", () => {
  it("pages a text artifact and reports the remaining offset", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-forensics-page")
    try {
      await writeFile(
        path.join(workspace, "notes.txt"),
        Array.from({ length: 15 }, (_value, index) => `line ${index + 1}`).join("\n"),
        "utf8",
      )
      const module = await import("../tools/forensics/ctf-artifact-page.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }

      const first = await execute({ file: "notes.txt", limit: 10 }, context)
      expect(first).toContain("verdict: artifact_page")
      expect(first).toContain("totalLines: 15")
      expect(first).toContain("1: line 1")
      expect(first).toContain("10: line 10")
      expect(first).toContain("nextOffset: 10")

      const second = await execute({ file: "notes.txt", offset: 10 }, context)
      expect(second).toContain("11: line 11")
      expect(second).toContain("15: line 15")
      expect(second).toContain("nextOffset: none")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("routes a PNG to the image opener and keeps external metadata optional", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-forensics-media")
    try {
      await writeFile(path.join(workspace, "dot.png"), PNG_1X1)
      const module = await import("../tools/forensics/ctf-media-open.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }

      const text = await execute({ target: "dot.png", tryOcr: false, exif: false }, context)

      expect(text.startsWith("CTF_MEDIA_OPEN:")).toBe(true)
      expect(text).toContain("- media_kind: image")
      expect(text).toContain("- route: ctf-image-open")
      expect(text).toContain("- result:")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("reports image facts without invoking exiftool", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-forensics-image")
    try {
      await writeFile(path.join(workspace, "dot.png"), PNG_1X1)
      const module = await import("../tools/forensics/ctf-image-open.ts")
      const execute = module.default.execute as Execute
      const payload = JSON.parse(
        await execute(
          { target: "dot.png", tryOcr: false, exif: false, jsonOnly: true },
          {
            directory: workspace,
            worktree: workspace,
          },
        ),
      )

      expect(payload.target).toContain("dot.png")
      expect(payload.info).toContain("kind: png")
      expect(payload.info).toContain("size: 67")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("routes a bare image artifact to the stego default with a delegated verdict", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-forensics-analyze")
    try {
      await writeFile(path.join(workspace, "dot.png"), PNG_1X1)
      const module = await import("../tools/forensics/ctf-forensics-analyze.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "dot.png" }, { directory: workspace, worktree: workspace })

      expect(text.startsWith("CTF_FORENSICS_ANALYZE:")).toBe(true)
      expect(text).toContain("- size: 67")
      expect(text).toContain("- route: stego")
      expect(text).toContain("delegated_result:")
      expect(text).toContain("verdict: stego_media")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
