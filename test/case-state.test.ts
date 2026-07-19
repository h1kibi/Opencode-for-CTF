import { describe, expect, it } from "vitest"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { appendCaseEvent, caseEventsFile, caseStateFile, migrateLegacyCase, readCase, updateCase } from "../src/case-state.ts"

describe("canonical case state", () => {
  it("creates and atomically updates case.json with an event log", async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ctf-case-"))
    const initial = await readCase(worktree, "web-demo")
    expect(initial.schemaVersion).toBe(1)
    await updateCase(worktree, "web-demo", (state) => ({ ...state, family: "web", lane: "expert" }))
    await appendCaseEvent(worktree, "web-demo", "route.selected", { family: "web" })
    expect(JSON.parse(await readFile(caseStateFile(worktree, "web-demo"), "utf8")).family).toBe("web")
    expect((await readFile(caseEventsFile(worktree, "web-demo"), "utf8")).trim()).toContain("route.selected")
  })

  it("migrates legacy JSON state once and remains idempotent", async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ctf-case-migrate-"))
    const legacy = path.join(worktree, ".ctf-state.json")
    await writeFile(legacy, JSON.stringify({ category: "crypto", target: "local", flagFormat: "flag{...}" }))
    const first = await migrateLegacyCase({ caseId: "crypto-demo", worktree, legacyStateFiles: [legacy] })
    expect(first.migrated).toBe(true)
    expect(first.state.family).toBe("crypto")
    const second = await migrateLegacyCase({ caseId: "crypto-demo", worktree, legacyStateFiles: [legacy] })
    expect(second.migrated).toBe(false)
    expect(second.state.family).toBe("crypto")
  })
})
