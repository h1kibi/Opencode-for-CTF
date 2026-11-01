import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"

type Execute = (args: Record<string, unknown>, context: { directory: string; worktree: string }) => Promise<string>

const OPENAPI_SPEC = {
  openapi: "3.0.0",
  paths: {
    "/api/users/{userId}": { get: { operationId: "getUser" }, delete: { operationId: "deleteUser" } },
    "/api/admin/config": { post: { operationId: "updateConfig" } },
    "/login": { post: { operationId: "login", security: [] } },
  },
}

function apiRows(text: string): Record<string, string>[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && !line.startsWith("---") && !line.startsWith("Method"))
  return lines.map((line) => {
    const cells = line.split("|").map((cell) => cell.trim())
    return {
      method: cells[0] ?? "",
      path: cells[1] ?? "",
      auth: cells[2] ?? "",
      objectId: cells[3] ?? "",
      stateChanging: cells[4] ?? "",
      bugs: cells[5] ?? "",
      firstCheck: cells[6] ?? "",
    }
  })
}

describe("ctf-web-pattern-search", () => {
  it("returns scored hits from the shipped pattern library", async () => {
    const module = await import("../tools/web/ctf-web-pattern-search.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { query: "sql injection union bypass filter", maxHits: 3 },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(text).toContain("Pattern matches for: sql injection union bypass filter")
    expect(text).toContain("File | Line | Score | Match")
    const rows = text.split("\n").filter((line) => line.includes("ctf-web-patterns") && line.includes("|"))
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.length).toBeLessThanOrEqual(3)
    expect(rows[0]).toContain("server-side-patterns.md")
    expect(text).toContain("Use rule: convert a selected pattern into one low-risk focused")
  })

  it("reports an empty result set when nothing in the library matches", async () => {
    const module = await import("../tools/web/ctf-web-pattern-search.ts")
    const execute = module.default.execute as Execute

    const text = await execute(
      { query: "zzzunmatchabletokenqqq", maxHits: 3 },
      { directory: process.cwd(), worktree: process.cwd() },
    )

    expect(text).toContain("Pattern matches for: zzzunmatchabletokenqqq")
    expect(text).not.toContain("server-side-patterns.md")
  })
})

describe("ctf-whitebox-handoff", () => {
  it("renders scope, map, and findings into the handoff report", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-whitebox-report")
    try {
      const module = await import("../tools/web/ctf-whitebox-handoff.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }

      await execute(
        {
          operation: "init",
          scopeJson: JSON.stringify({ target: "http://app.local", framework: "flask" }),
          stackJson: JSON.stringify({ language: "python" }),
        },
        context,
      )
      await execute(
        {
          operation: "add_entrypoint",
          itemJson: JSON.stringify({ route: "/search", file: "app.py", handler: "search", line: 42 }),
        },
        context,
      )
      await execute(
        {
          operation: "add_sink",
          itemJson: JSON.stringify({ kind: "sql", api: "cursor.execute", file: "app.py", line: 55 }),
        },
        context,
      )
      await execute(
        {
          operation: "add_finding",
          findingJson: JSON.stringify({
            title: "sqli in /search",
            file: "app.py",
            line: 55,
            verdict: "candidate",
            chain_implication: "auth bypass",
          }),
        },
        context,
      )

      const text = await execute({ operation: "report" }, context)

      expect(text).toContain("# CTF White-box Handoff")
      expect(text).toContain("http://app.local")
      expect(text).toContain("/search | app.py | search | 42")
      expect(text).toContain("sql | cursor.execute | app.py | 55")
      expect(text).toContain("sqli in /search | app.py | 55 | candidate | auth bypass")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("refuses to run an evidence gate without a finding", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-whitebox-gate")
    try {
      const module = await import("../tools/web/ctf-whitebox-handoff.ts")
      const execute = module.default.execute as Execute
      const context = { directory: workspace, worktree: workspace }

      await execute({ operation: "init", scopeJson: JSON.stringify({ target: "http://app.local" }) }, context)
      const blocked = await execute({ operation: "gate", gateJson: JSON.stringify({}) }, context)

      expect(blocked).toBe("BLOCK: gate requires a finding with an id, title, or vulnerability_type")

      const text = await execute({ operation: "report" }, context)
      const findingRows = text
        .split("\n")
        .filter((line) => line.includes("false_positive") || line.includes("| candidate |"))
      expect(findingRows).toEqual([])
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})

describe("ctf-api-map", () => {
  it("maps an OpenAPI spec into methods, auth guesses, and safe first checks", async () => {
    const workspace = await makeTestWorkspaceAsync("ctf-api-map")
    try {
      await writeFile(path.join(workspace, "openapi.json"), JSON.stringify(OPENAPI_SPEC, null, 2), "utf8")
      const module = await import("../tools/web/ctf-api-map.ts")
      const execute = module.default.execute as Execute

      const text = await execute({ file: "openapi.json" }, { directory: workspace, worktree: workspace })
      const rows = apiRows(text)

      expect(rows).toHaveLength(4)

      const get = rows.find((row) => row.method === "GET" && row.path === "/api/users/{userId}")
      expect(get?.objectId).toBe("yes")
      expect(get?.stateChanging).toBe("no")
      expect(get?.bugs).toContain("idor")
      expect(get?.firstCheck).toContain("curl -s -o /dev/null")

      const del = rows.find((row) => row.method === "DELETE")
      expect(del?.stateChanging).toBe("yes")
      expect(del?.firstCheck).toContain("DO NOT send DELETE as first safe check")

      const admin = rows.find((row) => row.path === "/api/admin/config")
      expect(admin?.auth).toBe("likely auth")
      expect(admin?.firstCheck).toContain("State-changing method")

      const login = rows.find((row) => row.path === "/login")
      expect(login?.auth).toBe("likely public")
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
