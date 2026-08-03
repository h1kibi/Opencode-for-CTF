import { mkdtempSync, writeFileSync } from "node:fs"
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
})
