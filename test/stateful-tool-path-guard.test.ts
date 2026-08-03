import { mkdtempSync, readdirSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path, { join } from "node:path"
import { describe, expect, it } from "vitest"

type ToolLike = {
  execute: (args: Record<string, unknown>, context?: { directory?: string }) => Promise<string>
}

function makeEscapeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "ctf-state-guard-"))
  const outside = mkdtempSync(join(tmpdir(), "ctf-state-guard-out-"))
  const linkType = process.platform === "win32" ? "junction" : "dir"
  symlinkSync(outside, join(root, "leak"), linkType)
  return { root, outside }
}

describe("stateful tool workspace path guards", () => {
  it("quarantines corrupt decision-state and rebuilds fresh instead of silently losing it", async () => {
    const root = mkdtempSync(join(tmpdir(), "ctf-state-corrupt-"))
    writeFileSync(join(root, ".ctf-decision-state.json"), "{not-json", "utf8")
    const mod = await import("../tools/core/ctf-decision-state.ts")
    const tool = mod.default as unknown as ToolLike

    const out = await tool.execute({ operation: "init" }, { directory: root })
    expect(String(out)).toContain("mode: medium")
    expect(readdirSync(root).some((name) => name.startsWith(".ctf-decision-state.json.corrupt-"))).toBe(true)
    expect(String(out)).toContain("state_path: .ctf-decision-state.json")
  })

  it("rejects symlink-escaped decision-state paths", async () => {
    const { root } = makeEscapeWorkspace()
    const mod = await import("../tools/core/ctf-decision-state.ts")
    const tool = mod.default as unknown as ToolLike

    await expect(
      tool.execute(
        {
          operation: "init",
          statePath: path.join("leak", ".ctf-decision-state.json"),
        },
        { directory: root },
      ),
    ).rejects.toThrow(/symlink/)
  })

  it("rejects symlink-escaped whitebox handoff paths", async () => {
    const { root } = makeEscapeWorkspace()
    const mod = await import("../tools/web/ctf-whitebox-handoff.ts")
    const tool = mod.default as unknown as ToolLike

    await expect(
      tool.execute(
        {
          operation: "init",
          statePath: path.join("leak", ".ctf-whitebox-handoff.json"),
        },
        { directory: root },
      ),
    ).rejects.toThrow(/symlink/)
  })

  it("rejects symlink-escaped evidence board output paths", async () => {
    const { root } = makeEscapeWorkspace()
    const prev = process.cwd()
    process.chdir(root)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
      const tool = mod.default as unknown as ToolLike
      await expect(
        tool.execute({
          command: "init",
          challengeName: "demo",
          category: "web",
          target: "http://127.0.0.1",
          board: path.join("leak", ".ctf-evidence-board.json"),
        }),
      ).resolves.toMatch(/ERROR: .*symlink/)
    } finally {
      process.chdir(prev)
    }
  })
})
