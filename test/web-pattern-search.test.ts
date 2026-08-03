import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

type ToolLike = {
  execute: (args: Record<string, unknown>, context?: { directory?: string }) => Promise<string>
}

describe("ctf-web-pattern-search", () => {
  it("uses bundled plugin references by default instead of process cwd", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-web-pattern-default-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-web-pattern-other-"))
    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/web/ctf-web-pattern-search.ts")
      const tool = mod.default as unknown as ToolLike
      const out = await tool.execute({ query: "template expression" }, { directory: dir })
      expect(out).toContain("Pattern matches for: template expression")
      expect(out).not.toContain("cannot read pattern directory")
      expect(out).toContain("Match")
    } finally {
      process.chdir(prev)
    }
  })

  it("resolves an explicit relative patternDir against context.directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-web-pattern-local-"))
    const refs = join(dir, "refs")
    mkdirSync(refs)
    writeFileSync(
      join(refs, "local.md"),
      ["# local refs", "template expression sink confirmed", "primitive fit is high"].join("\n"),
      "utf8",
    )

    const mod = await import("../tools/web/ctf-web-pattern-search.ts")
    const tool = mod.default as unknown as ToolLike
    const out = await tool.execute({ query: "template expression", patternDir: "refs" }, { directory: dir })
    expect(out).toContain("local.md")
    expect(out).not.toContain("cannot read pattern directory")
  })
})
