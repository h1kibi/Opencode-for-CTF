import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

describe("ctf-pcap-probe", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves targets and docker mounts from context.worktree instead of process cwd", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "ctf-pcap-workspace-"))
    const other = mkdtempSync(join(tmpdir(), "ctf-pcap-other-"))
    mkdirSync(join(workspace, "captures"), { recursive: true })
    const target = join(workspace, "captures", "trace.pcap")
    writeFileSync(target, Buffer.from("http://example.com/flag\nflag{pcap-test}\n"))

    const execSpy = vi.spyOn(execUtils, "safeExec").mockImplementation(async (cmd, args) => {
      if (cmd === "docker" && Array.isArray(args) && args[0] === "image" && args[1] === "inspect") {
        return { ok: true, exitCode: 0, output: "sha256:abc123" }
      }
      return { ok: false, exitCode: 127, output: "<failed: missing tool>" }
    })
    const dockerSpy = vi
      .spyOn(execUtils, "safeExecDocker")
      .mockImplementation(async (_root, _file, _image, shellCommand) => {
        if (shellCommand.startsWith("file ")) return { ok: true, exitCode: 0, output: "pcap capture file" }
        if (shellCommand.startsWith("capinfos ")) return { ok: true, exitCode: 0, output: "Number of packets: 2" }
        if (shellCommand.includes("io,phs")) return { ok: true, exitCode: 0, output: "eth\nip" }
        if (shellCommand.includes("http.request"))
          return { ok: true, exitCode: 0, output: "1\texample.com\tGET\t/flag" }
        if (shellCommand.includes("dns.qry.name")) return { ok: true, exitCode: 0, output: "flag.example" }
        if (shellCommand.includes("tcp.stream")) return { ok: true, exitCode: 0, output: "0\n1" }
        return { ok: true, exitCode: 0, output: "ok" }
      })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/forensics/ctf-pcap-probe.ts")
      const out = await mod.default.execute({ target: "captures/trace.pcap" }, {
        directory: workspace,
        worktree: workspace,
      } as never)

      expect(out).toContain(`target: ${target}`)
      expect(out).toContain("probe_backend: docker")
      expect(out).toContain("backend_reason: host_tools_missing[file,capinfos,tshark]")
      expect(out).toContain("- 1\texample.com\tGET\t/flag")
    } finally {
      process.chdir(prev)
    }

    expect(execSpy).toHaveBeenCalled()
    expect(dockerSpy).toHaveBeenCalled()
    expect(dockerSpy.mock.calls[0]?.[0]).toBe(workspace)
    expect(dockerSpy.mock.calls[0]?.[1]).toBe(target)
  })
})
