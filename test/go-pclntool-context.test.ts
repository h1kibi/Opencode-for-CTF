import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

describe("ctf-go-pclntool", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses context.worktree for docker execution and context.directory for rename path", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-go-pcln-workspace-"))
    const challengeDir = join(workspace, "challenge")
    const other = mkdtempSync(join(tmpdir(), "ctf-go-pcln-other-"))
    mkdirSync(join(workspace, "bin"), { recursive: true })
    mkdirSync(challengeDir, { recursive: true })
    const target = join(workspace, "bin", "sample-go")
    writeFileSync(target, Buffer.from("go-binary"))

    const execSpy = vi.spyOn(execUtils, "safeExec").mockImplementation(async (cmd, args) => {
      if (cmd === "go" && Array.isArray(args) && args[0] === "version") {
        return { ok: false, exitCode: 127, output: "<failed: go missing>" }
      }
      if (cmd === "docker" && Array.isArray(args) && args[0] === "image" && args[1] === "inspect") {
        return { ok: true, exitCode: 0, output: "sha256:def456" }
      }
      return { ok: false, exitCode: 1, output: "<failed>" }
    })
    const dockerSpy = vi
      .spyOn(execUtils, "safeExecDocker")
      .mockImplementation(async (_root, _file, _image, shellCommand) => {
        if (shellCommand === "go version") {
          return { ok: true, exitCode: 0, output: "go version go1.22.0 linux/amd64" }
        }
        if (shellCommand.includes("go tool nm")) {
          return {
            ok: true,
            exitCode: 0,
            output: [
              "0049f140 T main.main",
              "0049f080 T main.init",
              "0048d000 T runtime.main",
              "0049f1c0 T acme.VerifyFlag",
            ].join("\n"),
          }
        }
        if (shellCommand.includes("go tool objdump")) {
          return {
            ok: true,
            exitCode: 0,
            output: ["TEXT main.main(SB) /tmp/sample.go", "  sample.go:10\t0x0049f140\tCALL main.init(SB)"].join("\n"),
          }
        }
        return { ok: true, exitCode: 0, output: "ok" }
      })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-go-pclntool.ts")
      const out = await mod.default.execute({ target: "bin/sample-go", jsonOnly: true }, {
        directory: challengeDir,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      const renamePath = join(workspace, "work", "rev-go-pclntool", "rename_reva.jsonl")

      expect(payload.backend).toBe("docker")
      expect(payload.target).toBe(target)
      expect(payload.rename_script_path).toBe("../work/rev-go-pclntool/rename_reva.jsonl")
      expect(payload.user_priority_top60).toContain("0x0049f140\tmain.main")
      expect(payload.recommended_next.join("\n")).toContain(
        "apply rename script ../work/rev-go-pclntool/rename_reva.jsonl",
      )
      expect(existsSync(renamePath)).toBe(true)
      expect(readFileSync(renamePath, "utf8")).toContain('"name":"main.main"')
    } finally {
      process.chdir(prev)
    }

    expect(execSpy).toHaveBeenCalled()
    expect(dockerSpy).toHaveBeenCalled()
    expect(dockerSpy.mock.calls[0]?.[0]).toBe(workspace)
    expect(dockerSpy.mock.calls[0]?.[1]).toBe(target)
  })
})
