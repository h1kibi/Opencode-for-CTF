import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("web source tools context", () => {
  it("resolves source trees and source maps relative to context.directory inside worktree", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-websrc-workspace-"))
    const challenge = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-websrc-other-"))
    const app = join(workspace, "app")
    mkdirSync(challenge, { recursive: true })
    mkdirSync(app, { recursive: true })
    writeFileSync(join(app, "server.js"), "app.get('/flag',(req,res)=>res.send(process.env.FLAG||'no'));", "utf8")
    writeFileSync(
      join(app, "bundle.js.map"),
      JSON.stringify({ sources: ["webpack://src/server.js"], sourcesContent: ["const FLAG='flag{mapctx}'"] }),
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mapRead = await import("../tools/web/ctf-source-map-read.ts")
      const listed = await mapRead.default.execute(
        { target: "../app/bundle.js.map", operation: "list", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const listedPayload = JSON.parse(String(listed))
      expect(listedPayload.target).toBe(join(app, "bundle.js.map"))
      expect(listedPayload.rows[0].source).toBe("webpack://src/server.js")

      const sourceMap = await import("../tools/web/ctf-web-source-map.ts")
      const mapped = await sourceMap.default.execute({ target: "../app", maxFiles: 10, maxBytesPerFile: 20000 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(mapped)).toContain("/flag")
      expect(String(mapped)).toContain("server.js: express: /flag")

      const firstPack = await import("../tools/web/ctf-source-first-pack.ts")
      const pack = await firstPack.default.execute({ target: "../app", maxFiles: 20 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(pack)).toContain("target: ../app")
      expect(String(pack)).toContain("server.js")
    } finally {
      process.chdir(prev)
    }
  })
})
