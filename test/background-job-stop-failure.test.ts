import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

import backgroundJob from "../tools/core/ctf-background-job.ts"

describe("ctf-background-job stop contract", () => {
  it("reports a failed stop instead of claiming stopped=true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-bg-stop-fail-"))
    const jobDir = path.join(dir, "work", "background-jobs", "fail")
    await mkdir(jobDir, { recursive: true })
    await writeFile(
      path.join(jobDir, "job.json"),
      JSON.stringify({
        id: "fail",
        pid: process.pid,
        scriptPath: path.join(jobDir, "run.js"),
        workdir: jobDir,
        stdoutPath: path.join(jobDir, "stdout.log"),
        stderrPath: path.join(jobDir, "stderr.log"),
        startedAt: new Date().toISOString(),
        argv: [],
      }),
      "utf8",
    )

    const spawnMock = vi.mocked(spawn)
    spawnMock.mockImplementation((() => {
      const child = new EventEmitter() as ReturnType<typeof spawn>
      setImmediate(() => child.emit("exit", 1))
      return child
    }) as typeof spawn)

    const out = await backgroundJob.execute({ operation: "stop", id: "fail", jsonOnly: true }, {
      directory: dir,
    } as never)
    const parsed = JSON.parse(String(out))
    expect(parsed.ok).toBe(false)
    expect(parsed.stopped).toBe(false)
    expect(parsed.error).toMatch(/taskkill exited with code 1/)
  })
})
