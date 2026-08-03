import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

describe("ctf-windows-gui-inspect", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("writes its script and executes PowerShell from context.worktree", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-win-gui-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-win-gui-other-"))
    const execSpy = vi.spyOn(execUtils, "safeExecWithStreams").mockResolvedValue({
      stdout: JSON.stringify([
        {
          ProcessName: "BabyGame",
          Id: 4242,
          MainWindowTitle: "BabyGame",
          MainWindowHandle: "0x10",
          ChildPreview: [
            { ControlType: "Button", Name: "Start", AutomationId: "btnStart", ClassName: "Button", IsEnabled: true },
          ],
        },
      ]),
      stderr: "",
      ok: true,
      exitCode: 0,
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-windows-gui-inspect.ts")
      const out = await mod.default.execute({ jsonOnly: true }, { directory: workspace, worktree: workspace } as never)
      const payload = JSON.parse(String(out))
      const scriptPath = join(workspace, "work", "windows-gui-inspect", "uia_inspect.ps1")

      expect(payload[0]?.ProcessName).toBe("BabyGame")
      expect(existsSync(scriptPath)).toBe(true)
      expect(readFileSync(scriptPath, "utf8")).toContain("UIAutomationClient")
      expect(execSpy).toHaveBeenCalledTimes(1)
      expect(execSpy.mock.calls[0]?.[0]).toBe("powershell")
      expect(execSpy.mock.calls[0]?.[1]).toContain(scriptPath)
      expect(execSpy.mock.calls[0]?.[2]).toMatchObject({ cwd: workspace, timeoutMs: 30000 })
    } finally {
      process.chdir(prev)
    }
  })
})
