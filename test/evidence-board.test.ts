import { describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("ctf-evidence-board Evidence.md + route states", () => {
  it("init writes Evidence.md and enforces 3 routes + blocked≠dead", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const mod = await import("../tools/ctf-evidence-board.ts")
      const tool = mod.default as unknown as {
        execute: (args: Record<string, unknown>, context?: unknown) => Promise<string>
      }

      const initOut = await tool.execute({
        command: "init",
        challengeName: "demo",
        category: "web",
        target: "http://127.0.0.1:8000",
        flagFormat: "flag{}",
        strategy: "test",
      })
      expect(initOut).toContain("Evidence initialized")
      expect(existsSync(join(dir, "Evidence.md"))).toBe(true)
      expect(existsSync(join(dir, ".ctf-evidence-board.json"))).toBe(true)

      const badRoutes = await tool.execute({
        command: "set-routes",
        routesJson: JSON.stringify([{ name: "only-one" }]),
      })
      expect(badRoutes).toMatch(/exactly 3/)

      const okRoutes = await tool.execute({
        command: "set-routes",
        routesJson: JSON.stringify([
          { name: "ssti", whyNow: "template echo", verifyMethod: "{{7*7}}", expected: "49" },
          { name: "sqli", whyNow: "error based", verifyMethod: "'", expected: "sql error" },
          { name: "idor", whyNow: "user id", verifyMethod: "id=2", expected: "other user" },
        ]),
      })
      expect(okRoutes).toContain("3 routes")

      const refuseDead = await tool.execute({
        command: "set-route-state",
        routeId: "R1",
        routeState: "dead",
        blockReason: "403 once",
      })
      expect(refuseDead).toMatch(/refuse dead|attempts/)

      const blocked = await tool.execute({
        command: "set-route-state",
        routeId: "R1",
        routeState: "blocked",
        blockReason: "WAF on {{",
        nextProbe: "try encoding",
      })
      expect(blocked).toContain("blocked")

      const forceDead = await tool.execute({
        command: "set-route-state",
        routeId: "R2",
        routeState: "dead",
        attempts: 3,
        blockReason: "force differential: always empty",
      })
      expect(forceDead).toContain("dead")

      const md = readFileSync(join(dir, "Evidence.md"), "utf-8")
      expect(md).toContain("Routes")
      expect(md).toContain("ssti")
      expect(md).toMatch(/blocked ≠ dead|blocked/)
    } finally {
      process.chdir(prev)
    }
  })
})
