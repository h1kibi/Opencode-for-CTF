import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

describe("Windows REV helpers context", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.skipIf(process.platform !== "win32")(
    "ctf-windows-expect-runner resolves paths from context and runs in artifact dir",
    async () => {
      const workspace = mkdtempSync(join(tmpdir(), "ctf-winexp-workspace-"))
      const challenge = join(workspace, "challenge")
      const other = mkdtempSync(join(tmpdir(), "ctf-winexp-other-"))
      mkdirSync(join(workspace, "bin"), { recursive: true })
      mkdirSync(challenge, { recursive: true })
      writeFileSync(join(workspace, "bin", "checker.exe"), "MZ", "utf8")

      const streamSpy = vi.spyOn(execUtils, "safeExecWithStreams").mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, exit_code: 0, timed_out: false, stdout: "OK", stderr: "" }),
        stderr: "",
      })

      const prev = process.cwd()
      process.chdir(other)
      try {
        const mod = await import("../tools/rev/ctf-windows-expect-runner.ts")
        const out = await mod.default.execute({ target: "../bin/checker.exe", stdinText: "guess", jsonOnly: true }, {
          directory: challenge,
          worktree: workspace,
        } as never)
        const payload = JSON.parse(String(out))
        expect(payload.target).toBe(join(workspace, "bin", "checker.exe"))
        expect(payload.stdin_file).toBe("../work/rev-windows-expect/stdin.txt")
        expect(existsSync(join(workspace, "work", "rev-windows-expect", "expect_runner.ps1"))).toBe(true)
      } finally {
        process.chdir(prev)
      }

      expect(streamSpy.mock.calls[0][2]?.cwd).toBe(join(workspace, "work", "rev-windows-expect"))
    },
  )

  it("ctf-windows-debug-helper writes scripts under worktree and does not use process cwd for cdb discovery", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-windbg-workspace-"))
    const challenge = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-windbg-other-"))
    mkdirSync(join(workspace, "bin"), { recursive: true })
    mkdirSync(challenge, { recursive: true })
    writeFileSync(join(workspace, "bin", "checker.exe"), "MZ", "utf8")

    const safeSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: false, exitCode: 1, output: "not found" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-windows-debug-helper.ts")
      const out = await mod.default.execute(
        { target: "../bin/checker.exe", debugger: "auto", breakpoints: "main", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const payload = JSON.parse(String(out))
      expect(payload.target).toBe(join(workspace, "bin", "checker.exe"))
      expect(payload.outputs.cdb_commands).toBe("../work/rev-windows-debug/cdb_commands.txt")
      expect(existsSync(join(workspace, "work", "rev-windows-debug", "cdb_commands.txt"))).toBe(true)
    } finally {
      process.chdir(prev)
    }

    expect(safeSpy.mock.calls[0][0]).toBe("where")
    expect(safeSpy.mock.calls[0][2]).toBe(workspace)
  })
})
