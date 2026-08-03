import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

describe("ctf-artifact-analyze context", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("runs file probes near the target and stores IR under context.worktree", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-artifact-workspace-"))
    const challengeDir = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-artifact-other-"))
    mkdirSync(join(workspace, "bin"), { recursive: true })
    mkdirSync(challengeDir, { recursive: true })
    const target = join(workspace, "bin", "chall")
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from("flag{artifact-context}\n")]),
    )

    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({
      ok: true,
      exitCode: 0,
      output: "ELF 64-bit LSB executable",
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-artifact-analyze.ts")
      const out = await mod.default.execute({ action: "build", target: "../bin/chall", jsonOnly: true }, {
        directory: challengeDir,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.artifact.kind).toBe("elf")
      expect(
        payload.entries.some(
          (e: { kind: string; detail?: string }) => e.kind === "secret" && e.detail?.includes("flag{artifact-context}"),
        ),
      ).toBe(true)
      expect(existsSync(join(workspace, "work", "analysis", "chall", "artifact.db.json"))).toBe(true)
    } finally {
      process.chdir(prev)
    }

    const call = execSpy.mock.calls[0] as unknown[]
    const probedArgs = call?.[1] as string[] | undefined
    const probedTarget = String(probedArgs?.[0])
    expect(call?.[0]).toBe("file")
    expect(probedTarget.replace(/\\/g, "/")).toMatch(/\/bin\/chall$/)
    expect(call?.[2]).toBe(dirname(probedTarget))
    expect(call?.[3]).toBe(5000)
  })
})
