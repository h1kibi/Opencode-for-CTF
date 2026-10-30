import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

function field(text: string, label: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${label}:`))
    ?.slice(label.length + 1)
    .trim()
}

describe("ctf-route-plan", () => {
  it("sends a strong web description to the fast web lane", async () => {
    const module = await import("../tools/core/ctf-route-plan.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { text: "web challenge: flask app at https://x.example/, jwt auth, admin bot, sourcemap available" },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(text).toContain("CTF ROUTE DECISION (BINDING)")
    expect(field(text, "mode")).toBe("fast")
    expect(field(text, "primary_agent")).toBe("ctf-fast")
    expect(field(text, "category")).toBe("web")
    expect(field(text, "tool_packs")).toBe("core, web")
    expect(Number(field(text, "confidence"))).toBeGreaterThan(0.8)
  })

  it("defaults to the expert lane when the category is unclear", async () => {
    const module = await import("../tools/core/ctf-route-plan.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { text: "binary provided, unclear category" },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(field(text, "mode")).toBe("expert")
    expect(field(text, "primary_agent")).toBe("ctf-expert")
    expect(field(text, "category")).toBe("unknown")
    expect(text).toContain("category unclear")
  })

  it("treats an existing evidence branch as a resume decision", async () => {
    const module = await import("../tools/core/ctf-route-plan.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { text: "continue the investigation", hasEvidenceBranch: true },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(field(text, "mode")).toBe("resume")
    expect(field(text, "command")).toBe("/resume")
    expect(field(text, "primary_agent")).toBe("ctf-expert")
  })

  it("honours an explicit mode over the category signal", async () => {
    const module = await import("../tools/core/ctf-route-plan.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { text: "flask app with sql injection at https://x.example/", mode: "expert" },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(field(text, "mode")).toBe("expert")
    expect(field(text, "category")).toBe("web")
    expect(field(text, "primary_agent")).toBe("ctf-expert")
  })
})

describe("ctf-flag-grep", () => {
  it("reports a braced flag with its severity and location", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-flag-grep-hit")
    try {
      await writeFile(path.join(workspace, "out.txt"), "noise\nflag{tcache_poison_works}\nmore noise\n", "utf8")
      const module = await import("../tools/core/ctf-flag-grep.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "out.txt" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("flag{tcache_poison_works}")
      expect(text).toContain("[high/braced]")
      expect(text).toContain("out.txt")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("states the strict default rules when nothing qualifies", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-flag-grep-empty")
    try {
      await writeFile(path.join(workspace, "clean.txt"), "nothing here\njust noise\n", "utf8")
      const module = await import("../tools/core/ctf-flag-grep.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "clean.txt" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("no accepted flag candidates in 1 scanned files")
      expect(text).toContain("bare hashes require flag-file/readflag context")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
