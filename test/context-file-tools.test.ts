import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspace } from "./support/test-workspace.ts"

describe("context-aware CTF file tools", () => {
  it("ctf-background-job status uses context.worktree when directory is absent", async () => {
    const workspace = makeTestWorkspace("ctf-bg-workspace")
    const other = makeTestWorkspace("ctf-bg-other")
    const jobDir = join(workspace, "work", "background-jobs", "ctxjob")
    mkdirSync(jobDir, { recursive: true })
    const stdoutPath = join(jobDir, "stdout.log")
    const stderrPath = join(jobDir, "stderr.log")
    writeFileSync(stdoutPath, "done-from-worktree", "utf8")
    writeFileSync(stderrPath, "", "utf8")
    writeFileSync(
      join(jobDir, "job.json"),
      JSON.stringify({ id: "ctxjob", pid: 987654321, startedAt: "2026-08-02T00:00:00.000Z", stdoutPath, stderrPath }),
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-background-job.ts")
      const out = await mod.default.execute({ operation: "status", id: "ctxjob", jsonOnly: true }, {
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.stdoutTail).toContain("done-from-worktree")
    } finally {
      process.chdir(prev)
    }
  })
})
