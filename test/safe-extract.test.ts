import { execFile } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

const run = promisify(execFile)

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

async function makeArchive(workspace: string) {
  const source = path.join(workspace, "src")
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, "app.py"), 'FLAG = "flag{archived_secret}"\nprint(FLAG)\n', "utf8")
  await writeFile(path.join(source, "notes.txt"), "no secrets here\n", "utf8")
  await run("tar", ["-czf", "../bundle.tar.gz", "app.py", "notes.txt"], { cwd: source })
  await rm(source, { recursive: true, force: true })
}

describe("ctf-safe-extract", () => {
  it("extracts a real tarball and reports the flag it found", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-safe-extract")
    try {
      await makeArchive(workspace)
      const module = await import("../tools/core/ctf-safe-extract.ts")
      const execute = module.default.execute as Execute

      const text = await execute(
        { target: "bundle.tar.gz", overwrite: true },
        {
          directory: workspace,
          worktree: workspace,
        },
      )

      expect(text).toContain("archive_kind: tar")
      expect(text).toContain("verdict: flag_candidate")
      expect(text).toContain("members_listed: 2")
      expect(text).toContain("files_inspected: 2")
      expect(text).toMatch(/flag_hits:\n- app\.py: flag\{archived_secret\}/)
      expect(text).toContain("next_tool: ctf-evidence-board")

      const extracted = await readFile(path.join(workspace, "extracted", "bundle", "app.py"), "utf8")
      expect(extracted).toContain("flag{archived_secret}")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }, 60_000)

  it("refuses an archive with more members than maxFiles allows", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-safe-extract-limit")
    try {
      await makeArchive(workspace)
      const module = await import("../tools/core/ctf-safe-extract.ts")
      const execute = module.default.execute as Execute

      const text = await execute(
        { target: "bundle.tar.gz", maxFiles: 1 },
        { directory: workspace, worktree: workspace },
      )

      expect(text).toContain("status: blocked")
      expect(text).toContain("reason: member count exceeds maxFiles=1")
      expect(text).toContain("recommended_next: raise maxFiles only if the challenge requires it")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }, 60_000)
})
