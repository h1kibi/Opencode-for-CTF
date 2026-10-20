import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import backgroundJob from "../tools/core/ctf-background-job.ts"

async function writeJob(dir: string, id: string, meta: Record<string, unknown>) {
  const jobDir = path.join(dir, "work", "background-jobs", id)
  await mkdir(jobDir, { recursive: true })
  await writeFile(
    path.join(jobDir, "job.json"),
    JSON.stringify({
      id,
      scriptPath: path.join(jobDir, "run.js"),
      workdir: jobDir,
      stdoutPath: path.join(jobDir, "stdout.log"),
      stderrPath: path.join(jobDir, "stderr.log"),
      startedAt: new Date().toISOString(),
      argv: [],
      ...meta,
    }),
    "utf8",
  )
  return jobDir
}

describe("ctf-background-job stop contract", () => {
  it("refuses to signal its own process instead of claiming stopped=true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-bg-stop-fail-"))
    await writeJob(dir, "fail", { pid: process.pid })

    const out = await backgroundJob.execute({ operation: "stop", id: "fail", jsonOnly: true }, {
      directory: dir,
    } as never)
    const parsed = JSON.parse(String(out))
    expect(parsed.ok).toBe(false)
    expect(parsed.stopped).toBe(false)
    expect(parsed.error).toMatch(/unsafe pid/)
  })

  it("refuses to signal a non-positive pid, which would target the process group", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-bg-stop-zero-"))
    await writeJob(dir, "zero", { pid: 0 })

    const out = await backgroundJob.execute({ operation: "stop", id: "zero", jsonOnly: true }, {
      directory: dir,
    } as never)
    const parsed = JSON.parse(String(out))
    expect(parsed.ok).toBe(false)
    expect(parsed.stopped).toBe(false)
    expect(parsed.error).toMatch(/unsafe pid/)
  })

  it("redacts secret environment values and URL query credentials from collected output", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ctf-bg-redact-"))
    const jobDir = await writeJob(dir, "redact", { pid: 0 })
    vi.stubEnv("CTF_TEST_TOKEN", "super-secret-token")
    try {
      await writeFile(
        path.join(jobDir, "stdout.log"),
        "token=super-secret-token url=https://user:pass@example.test/x?api_key=super-secret-token\n",
        "utf8",
      )
      await writeFile(path.join(jobDir, "stderr.log"), "", "utf8")
      const out = await backgroundJob.execute({ operation: "read", id: "redact", jsonOnly: true }, {
        directory: dir,
      } as never)
      const parsed = JSON.parse(String(out))
      expect(parsed.stdout).not.toContain("super-secret-token")
      expect(parsed.stdout).toContain("REDACTED")
      expect(parsed.stdout).not.toContain("user:pass")
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
