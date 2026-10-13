import { describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildEvidenceSlug } from "../scripts/evidence-helper.ts"

describe("ctf-evidence-board Evidence.md + route states", () => {
  it("init writes Evidence.md in a category-challenge evidence case directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
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
      expect(initOut).toContain("case: web-demo")
      expect(existsSync(join(dir, "work", "ctf-evidence", "web-demo", "Evidence.md"))).toBe(true)
      expect(existsSync(join(dir, "work", "ctf-evidence", "web-demo", ".ctf-evidence-board.json"))).toBe(true)
      expect(existsSync(join(dir, "work", "ctf-evidence", "web-demo", "case.json"))).toBe(true)
      expect(existsSync(join(dir, "work", "ctf-evidence", "web-demo", "events.jsonl"))).toBe(true)
      expect(existsSync(join(dir, "work", "ctf-evidence", "web-demo", "route.json"))).toBe(true)
      expect(existsSync(join(dir, "work", "ctf-evidence", ".current"))).toBe(true)

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

      const caseState = JSON.parse(
        readFileSync(join(dir, "work", "ctf-evidence", "web-demo", "case.json"), "utf-8"),
      ) as { routes: Array<{ id: string; state: string }> }
      expect(caseState.routes).toHaveLength(3)
      expect(caseState.routes.find((route) => route.id === "R1")?.state).toBe("blocked")
      expect(caseState.routes.find((route) => route.id === "R2")?.state).toBe("dead")

      const md = readFileSync(join(dir, "work", "ctf-evidence", "web-demo", "Evidence.md"), "utf-8")
      expect(md).toContain("Routes")
      expect(md).toContain("ssti")
      expect(md).toMatch(/blocked ≠ dead|blocked/)
    } finally {
      process.chdir(prev)
    }
  })

  it("builds fallback evidence slugs from category and MMDDHHmmss", () => {
    const date = new Date("2026-07-19T13:17:06")
    expect(buildEvidenceSlug("pwn", undefined, date)).toBe("pwn-0719131706")
    expect(buildEvidenceSlug("web", "Hello World!", date)).toBe("web-hello-world")
  })

  it("uses context.directory instead of process cwd when initializing evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-context-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-ev-other-"))
    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
      const tool = mod.default as unknown as {
        execute: (args: Record<string, unknown>, context?: { directory?: string; worktree?: string }) => Promise<string>
      }

      const initOut = await tool.execute(
        {
          command: "init",
          challengeName: "context-demo",
          category: "misc",
          target: "challenge.zip",
        },
        { directory: dir },
      )
      expect(initOut).toContain("case: misc-context-demo")
      expect(existsSync(join(dir, "work", "ctf-evidence", "misc-context-demo", "Evidence.md"))).toBe(true)
      expect(existsSync(join(other, "work", "ctf-evidence", "misc-context-demo", "Evidence.md"))).toBe(false)
    } finally {
      process.chdir(prev)
    }
  })

  it("gates route -> live behind an oracle-verified flag", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-live-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
      const tool = mod.default as unknown as {
        execute: (args: Record<string, unknown>, context?: unknown) => Promise<string>
      }

      await tool.execute({
        command: "init",
        challengeName: "demo-live",
        category: "pwn",
        target: "nc 127.0.0.1 31337",
      })
      await tool.execute({
        command: "set-routes",
        routesJson: JSON.stringify([
          { name: "ret2win", whyNow: "win func", verifyMethod: "overflow", expected: "shell" },
          { name: "leak", whyNow: "fmt leak", verifyMethod: "%p", expected: "addr" },
          { name: "rop", whyNow: "no win", verifyMethod: "rop", expected: "execve" },
        ]),
      })

      // A flag-like string in evidence is NOT enough to go live.
      const refused = await tool.execute({
        command: "set-route-state",
        routeId: "R1",
        routeState: "live",
        evidence: "flag{decoy-in-output}",
      })
      expect(refused).toMatch(/requires a verified flag/)

      // Explicit oracle gate is accepted only with oracleVerified="true".
      const explicit = await tool.execute({
        command: "set-route-state",
        routeId: "R1",
        routeState: "live",
        oracleVerified: "true",
      })
      expect(explicit).toContain("live")

      // A second live route is refused.
      const secondLive = await tool.execute({
        command: "set-route-state",
        routeId: "R2",
        routeState: "live",
        oracleVerified: "true",
      })
      expect(secondLive).toMatch(/already live/)
    } finally {
      process.chdir(prev)
    }
  })

  it("records oracle-verified flags via flag-verify and then allows live", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-fv-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
      const tool = mod.default as unknown as {
        execute: (args: Record<string, unknown>, context?: unknown) => Promise<string>
      }

      await tool.execute({
        command: "init",
        challengeName: "demo-fv",
        category: "web",
        target: "http://127.0.0.1:9000",
      })
      await tool.execute({
        command: "set-routes",
        routesJson: JSON.stringify([
          { name: "sqli", whyNow: "login", verifyMethod: "'", expected: "error" },
          { name: "idor", whyNow: "ids", verifyMethod: "id=2", expected: "other" },
          { name: "jwt", whyNow: "token", verifyMethod: "forge", expected: "admin" },
        ]),
      })

      expect(await tool.execute({ command: "flag-verify", flagValue: "flag{real}" })).toMatch(/requires verifiedBy/)

      const verified = await tool.execute({
        command: "flag-verify",
        flagValue: "flag{real}",
        verifiedBy: "oracle",
        evidence: "hash matched on challenge platform",
      })
      expect(verified).toContain("Flag verified (oracle)")
      expect(verified).toContain("phase -> success")

      const live = await tool.execute({ command: "set-route-state", routeId: "R1", routeState: "live" })
      expect(live).toContain("live")

      const board = JSON.parse(
        readFileSync(join(dir, "work", "ctf-evidence", "web-demo-fv", ".ctf-evidence-board.json"), "utf-8"),
      ) as { phase: string; entries: Array<{ type: string; status: string }> }
      expect(board.phase).toBe("success")
      expect(board.entries.some((e) => e.type === "flag" && e.status === "confirmed")).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("rejects corrupt board JSON with a diagnostic instead of crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-corrupt-"))
    const prev = process.cwd()
    process.chdir(dir)
    try {
      const mod = await import("../tools/core/ctf-evidence-board.ts")
      const tool = mod.default as unknown as {
        execute: (args: Record<string, unknown>, context?: unknown) => Promise<string>
      }
      await tool.execute({
        command: "init",
        challengeName: "demo-corrupt",
        category: "misc",
        target: "challenge.zip",
      })
      writeFileSync(
        join(dir, "work", "ctf-evidence", "misc-demo-corrupt", ".ctf-evidence-board.json"),
        "{not-json",
        "utf8",
      )
      const out = await tool.execute({ command: "add-fact", finding: "x", evidence: "y" })
      expect(out).toMatch(/ERROR/)
      expect(out).toMatch(/corrupt|schema invalid/)
    } finally {
      process.chdir(prev)
    }
  })
  it("rejects unsafe explicit board and Markdown paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-paths-"))
    const mod = await import("../tools/core/ctf-evidence-board.ts")
    const tool = mod.default as unknown as { execute: (args: Record<string, unknown>, context?: unknown) => Promise<string> }
    const cases = [
      { board: "work/ctf-evidence/web-case/.ctf-evidence-board.json", evidenceMd: "work/ctf-evidence/web-case/nested/Evidence.md" },
      { board: "../outside/.ctf-evidence-board.json", evidenceMd: "work/ctf-evidence/web-case/Evidence.md" },
      { board: "work/ctf-evidence/Web Case/.ctf-evidence-board.json", evidenceMd: "work/ctf-evidence/Web Case/Evidence.md" },
      { board: "work/ctf-evidence/web-case/.ctf-evidence-board.json", evidenceMd: "work/ctf-evidence/other-case/Evidence.md" },
    ]
    for (const paths of cases) {
      const out = await tool.execute({ command: "summary", ...paths }, { directory: dir, worktree: dir } as never)
      expect(out).toMatch(/^ERROR:/)
    }
  })
  it("escapes challenge and route text in rendered Markdown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctf-ev-escape-"))
    const mod = await import("../tools/core/ctf-evidence-board.ts")
    const tool = mod.default as unknown as { execute: (args: Record<string, unknown>, context?: unknown) => Promise<string> }
    await tool.execute({ command: "init", challengeName: "name | [x]\n# heading", category: "web", target: "http://target" }, { directory: dir, worktree: dir } as never)
    await tool.execute({ command: "set-routes", routesJson: JSON.stringify([{ name: "route [x]", whyNow: "*bold*", verifyMethod: "`code`", expected: "# heading" }, { name: "two", whyNow: "", verifyMethod: "", expected: "" }, { name: "three", whyNow: "", verifyMethod: "", expected: "" }]) }, { directory: dir, worktree: dir } as never)
    const md = readFileSync(join(dir, "work", "ctf-evidence", "web-name-x-heading", "Evidence.md"), "utf8")
    expect(md).toContain("\\|")
    expect(md).toContain("\\[")
    expect(md).not.toContain("\n# heading")
  })
})
