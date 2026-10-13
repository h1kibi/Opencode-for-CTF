import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it, afterEach, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

function u16(n: number) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n)
  return b
}

function u32(n: number) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}

function storedZip(entries: Array<{ name: string; data: Buffer | string }>) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8")
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8")
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ])
    locals.push(local)
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }
  const central = Buffer.concat(centrals)
  return Buffer.concat([
    ...locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])
}

describe("context-aware CTF file tools", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ctf-binary-probe resolves challenge-relative targets inside worktree and probes near target", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-bin-workspace-"))
    const challenge = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-bin-other-"))
    mkdirSync(join(workspace, "bin"), { recursive: true })
    mkdirSync(challenge, { recursive: true })
    const target = join(workspace, "bin", "chall")
    writeFileSync(target, Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]), Buffer.from(" win flag{binctx}\n")]))

    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: true, exitCode: 0, output: "ok" })
    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-binary-probe.ts")
      const out = await mod.default.execute({ target: "../bin/chall", maxStrings: 20 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain("target:")
      expect(String(out)).toContain("flag{binctx}")
    } finally {
      process.chdir(prev)
    }

    const first = execSpy.mock.calls[0]
    const probedTarget = String((first[1] as string[])[0])
    expect(first[0]).toBe("file")
    expect(probedTarget.replace(/\\/g, "/")).toMatch(/\/bin\/chall$/)
    expect(first[2]).toBe(dirname(probedTarget))
  })

  it("ctf-apk-triage resolves target from context.directory but writes artifacts under worktree", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-apk-workspace-"))
    const challenge = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-apk-other-"))
    mkdirSync(join(workspace, "bin"), { recursive: true })
    mkdirSync(challenge, { recursive: true })
    const target = join(workspace, "bin", "app.apk")
    writeFileSync(
      target,
      storedZip([
        { name: "classes.dex", data: "Lcom/example/Main; check flag{apkctx} System.loadLibrary" },
        { name: "assets/secret.dat", data: "secret" },
      ]),
    )

    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: false, exitCode: 1, output: "missing" })
    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/android/ctf-apk-triage.ts")
      const out = await mod.default.execute({ target: "../bin/app.apk", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.target.replace(/\\/g, "/")).toMatch(/\/bin\/app\.apk$/)
      expect(payload.artifact_dir).toBe(join(workspace, "work", "apk-triage", "app.apk"))
      expect(payload.strings.flagLike).toContain("Lcom/example/Main; check flag{apkctx} System.loadLibrary")
      expect(existsSync(join(workspace, "work", "apk-triage", "app.apk", "apk-triage.json"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
    expect(execSpy.mock.calls[0][2]).toBe(dirname(target))
  })

  it("ctf-background-job status uses context.worktree when directory is absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-bg-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-bg-other-"))
    const jobDir = join(workspace, "work", "background-jobs", "ctxjob")
    mkdirSync(jobDir, { recursive: true })
    const stdoutPath = join(jobDir, "stdout.log")
    const stderrPath = join(jobDir, "stderr.log")
    writeFileSync(stdoutPath, "done-from-worktree", "utf8")
    writeFileSync(stderrPath, "", "utf8")
    writeFileSync(
      join(jobDir, "job.json"),
      JSON.stringify({ id: "ctxjob", pid: 987654321, startedAt: "2026-08-02T00:00:00.000Z", stdoutPath, stderrPath }),
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-background-job.ts")
      const out = await mod.default.execute({ operation: "status", id: "ctxjob", jsonOnly: true }, {
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.stdoutTail).toContain("done-from-worktree")
    } finally {
      process.chdir(prev)
    }
  })
})
