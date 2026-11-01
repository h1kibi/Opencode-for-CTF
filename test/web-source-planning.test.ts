import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const APP_JS = [
  'const express = require("express");',
  "const app = express();",
  'app.get("/api/users/:id", async (req, res) => {',
  '  const row = await db.query("SELECT * FROM users WHERE id=" + req.params.id);',
  "  res.json(row);",
  "});",
  'app.post("/api/admin/flag", (req, res) => { res.json({ flag: process.env.FLAG }); });',
  "module.exports = app;",
  "",
].join("\n")

async function makeSourceTree(workspace: string) {
  await mkdir(path.join(workspace, "src"), { recursive: true })
  await writeFile(path.join(workspace, "src", "app.js"), APP_JS, "utf8")
}

describe("web planning tools", () => {
  it("turns a WAF blocker into one family at a time", async () => {
    const module = await import("../tools/web/ctf-waf-bypass-plan.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      {
        blocker: "WAF blocks union select and spaces",
        stack: "node express",
        sink: "SQLi in /api/users/:id",
        evidence: "403 on union, quotes pass",
      },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(text).toContain("verdict: waf_bypass_plan_v1")
    expect(text).toContain("- Execute one family at a time")
    expect(text).toContain("bypass_matrix:")
    expect(text).toContain("family: encoding")
  })

  it("refuses an authz matrix without two actor states", async () => {
    const module = await import("../tools/web/ctf-web-authz-matrix.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { urlTemplate: "http://app.local/api/users/{id}", method: "GET" },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(text).toBe("BLOCK: provide at least two actor states, e.g. anonymous+user_a or user_a+user_b")
  })

  it("maps routes, inputs, and sinks from application source", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-web-source-map")
    try {
      await makeSourceTree(workspace)
      const module = await import("../tools/web/ctf-web-source-map.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "src" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("files_inspected: 1")
      expect(text).toContain("framework: Express/Node")
      expect(text).toContain("verdict: web_source")
      expect(text).toContain("routes:")
      expect(text).toContain("express: /api/users/:id")
      expect(text).toContain("express: /api/admin/flag")
      expect(text).toContain("sinks:")
      expect(text).toContain("SQL/string query")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("scores source signals so the first review has an order", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-source-first")
    try {
      await makeSourceTree(workspace)
      const module = await import("../tools/web/ctf-source-first-pack.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ target: "src" }, { directory: workspace, worktree: workspace })

      expect(text).toContain("# CTF Source First Pack")
      expect(text).toContain("files_seen: 1")
      expect(text).toContain("languages_stack: Node")
      expect(text).toMatch(/#1 score=\d+ family=config-secret file=app\.js/)
      expect(text).toContain("family=route")
      expect(text).toContain("family=sql")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
