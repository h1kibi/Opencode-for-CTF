﻿import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("ctf-route-plan context", () => {
  it("loads route config from context.directory instead of process cwd", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-route-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-route-other-"))
    writeFileSync(join(workspace, "opencode-for-ctf.jsonc"), JSON.stringify({ default_mode: "fast" }), "utf8")
    writeFileSync(join(other, "opencode-for-ctf.jsonc"), JSON.stringify({ default_mode: "expert" }), "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-route-plan.ts")
      const out = await mod.default.execute({ text: "simple xor cipher", mode: "auto" }, {
        directory: workspace,
        sessionID: "sess-route-context",
      } as never)
      expect(out).toContain("config_default_mode: fast")
      expect(out).toContain("primary_session_agent: ctf-fast")
    } finally {
      process.chdir(prev)
    }
  })
  it("does not persist session surfaces for a category worker", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-route-worker-"))
    const mod = await import("../tools/core/ctf-route-plan.ts")
    await mod.default.execute({ text: "simple xor cipher", mode: "auto" }, {
      directory: workspace,
      worktree: workspace,
      sessionID: "worker-route-session",
      agent: "ctf-web",
    } as never)
    expect(existsSync(join(workspace, "runtime", "state", "session-surfaces.json"))).toBe(false)
  })
})
