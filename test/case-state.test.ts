import { describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  appendCaseEvent,
  listCaseEvents,
  caseEventsFile,
  caseStateFile,
  migrateLegacyCase,
  readCase,
  updateCase,
} from "../src/case-state.ts"

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
const worker = path.join(projectRoot, "test", "fixtures", "file-lock-worker.mjs")

function runWorker(args: string[]) {
  const child = spawn(process.execPath, [tsxCli, worker, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  return { closed, getOutput: () => output }
}

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

  it("serializes concurrent cross-process event appends into valid JSONL", async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ctf-case-events-"))
    const first = runWorker(["case-events", worktree, "20", "2", "15", "concurrent"])
    const second = runWorker(["case-events", worktree, "20", "2", "15", "concurrent"])
    const [firstExit, secondExit] = await Promise.all([first.closed, second.closed])

    expect(firstExit.code, first.getOutput()).toBe(0)
    expect(secondExit.code, second.getOutput()).toBe(0)
    const events = await listCaseEvents(worktree, "concurrent")
    expect(events).toHaveLength(40)
    expect(new Set(events.map((event) => event.eventId)).size).toBe(40)
    expect(events.every((event) => event.caseId === "concurrent")).toBe(true)

    await rm(worktree, { recursive: true, force: true })
  }, 20_000)

  it("serializes cross-process legacy migration and emits one migration event", async () => {
    const worktree = await mkdtemp(path.join(os.tmpdir(), "ctf-case-migrate-race-"))
    await writeFile(path.join(worktree, "legacy.json"), JSON.stringify({ category: "crypto", target: "local" }))
    const first = runWorker(["migrate-case", worktree, "1", "0", "15000", "crypto-demo"])
    const second = runWorker(["migrate-case", worktree, "1", "0", "15000", "crypto-demo"])
    const [firstExit, secondExit] = await Promise.all([first.closed, second.closed])

    expect(firstExit.code, first.getOutput()).toBe(0)
    expect(secondExit.code, second.getOutput()).toBe(0)
    expect(JSON.parse(await readFile(caseStateFile(worktree, "crypto-demo"), "utf8"))).toMatchObject({
      family: "crypto",
      target: "local",
    })
    const events = await listCaseEvents(worktree, "crypto-demo")
    expect(events.filter((event) => event.type === "case.migrated")).toHaveLength(1)

    await rm(worktree, { recursive: true, force: true })
  }, 20_000)

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
