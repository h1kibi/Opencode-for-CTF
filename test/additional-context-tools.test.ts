import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as execUtils from "../tools/lib/exec-utils.ts"

function buildMemoryPe(): Buffer {
  const size = 0x2000
  const buf = Buffer.alloc(size)
  buf.write("MZ", 0, "latin1")
  buf.writeUInt32LE(0x40, 0x3c)
  buf.write("PE\0\0", 0x40, "latin1")
  buf.writeUInt16LE(0x8664, 0x44)
  buf.writeUInt16LE(1, 0x46)
  buf.writeUInt16LE(0xf0, 0x54)
  buf.writeUInt16LE(0x22, 0x56)
  buf.writeUInt16LE(0x20b, 0x58)
  buf.writeUInt32LE(0x1000, 0x68)
  buf.writeBigUInt64LE(0x140000000n, 0x70)
  buf.writeUInt32LE(0x1000, 0x78)
  buf.writeUInt32LE(0x200, 0x7c)
  buf.writeUInt32LE(0x2000, 0x90)
  buf.writeUInt32LE(0x200, 0x94)
  buf.writeUInt32LE(0, 0x98)
  const sectionTable = 0x58 + 0xf0
  buf.write(".text\0\0\0", sectionTable, "latin1")
  buf.writeUInt32LE(0x100, sectionTable + 8)
  buf.writeUInt32LE(0x1000, sectionTable + 12)
  buf.writeUInt32LE(0x200, sectionTable + 16)
  buf.writeUInt32LE(0x200, sectionTable + 20)
  buf.writeUInt32LE(0x60000020, sectionTable + 36)
  for (let i = 0; i < 0x100; i++) buf[0x1000 + i] = 0xcc
  return buf
}

function setupWorkspace(prefix: string) {
  const workspace = mkdtempSync(join(tmpdir(), `${prefix}-workspace-`))
  const challenge = join(workspace, "challenge")
  const other = mkdtempSync(join(tmpdir(), `${prefix}-other-`))
  mkdirSync(join(workspace, "bin"), { recursive: true })
  mkdirSync(challenge, { recursive: true })
  return { workspace, challenge, other }
}

describe("additional context-aware CTF tools", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ctf-python-inline resolves workdir from directory but writes temp script under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-py-inline")
    const workdir = join(workspace, "bin")
    const safeExecSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: true, exitCode: 0, output: "Python 3" })
    const streamSpy = vi
      .spyOn(execUtils, "safeExecWithStreams")
      .mockResolvedValue({ ok: true, exitCode: 0, stdout: "42\n", stderr: "" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-python-inline.ts")
      const out = await mod.default.execute({ code: "print(42)", workdir: "../bin", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.workdir).toBe(workdir)
      expect(payload.scriptPath).toBe(join(workspace, "work", "python-inline", "run.py"))
      expect(existsSync(payload.scriptPath)).toBe(true)
    } finally {
      process.chdir(prev)
    }

    expect(safeExecSpy).toHaveBeenCalled()
    expect(streamSpy.mock.calls[0][2]?.cwd).toBe(workdir)
  })

  it("ctf-python-inline falls back from a Windows drive-root worktree to the active directory", async () => {
    const { challenge, other } = setupWorkspace("ctf-py-inline-root")
    vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: true, exitCode: 0, output: "Python 3" })
    vi.spyOn(execUtils, "safeExecWithStreams").mockResolvedValue({ ok: true, exitCode: 0, stdout: "42\n", stderr: "" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-python-inline.ts")
      const out = await mod.default.execute({ code: "print(42)", jsonOnly: true }, {
        directory: challenge,
        worktree: "C:\\",
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.workdir).toBe(challenge)
      expect(payload.scriptPath).toBe(join(challenge, "work", "python-inline", "run.py"))
      expect(existsSync(payload.scriptPath)).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })
  it("ctf-elf-slice resolves ../bin targets from challenge and runs host tools near the binary", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-elf-slice")
    const target = join(workspace, "bin", "chall")
    writeFileSync(
      target,
      Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]), Buffer.from("flag{elfctx}\0main\0")]),
    )
    const execSpy = vi.spyOn(execUtils, "safeExec").mockImplementation(async (cmd: string) => {
      if (cmd === "readelf")
        return {
          ok: true,
          exitCode: 0,
          output:
            "Machine: Advanced Micro Devices X86-64\nClass: ELF64\nData: little endian\nType: EXEC\nEntry point address: 0x401000\n1: 0000000000401000 FUNC main",
        }
      if (cmd === "nm") return { ok: true, exitCode: 0, output: "0000000000401000 T main" }
      if (cmd === "objdump") return { ok: true, exitCode: 0, output: "0000000000401000 <main>:\n  401000: ret" }
      return { ok: true, exitCode: 0, output: "ok" }
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-elf-slice.ts")
      const out = await mod.default.execute({ target: "../bin/chall", maxStrings: 20, maxSlices: 1, jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.target).toBe(target)
      expect(payload.interesting_strings.some((s: { text: string }) => s.text.includes("flag{elfctx}"))).toBe(true)
    } finally {
      process.chdir(prev)
    }

    expect(execSpy.mock.calls.every((call) => call[2] === dirname(target))).toBe(true)
  })

  it("ctf-pe-hybrid-rebuild reads targets from challenge-relative paths and writes output under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-pe-hybrid")
    const original = join(workspace, "bin", "orig.exe")
    const memory = join(workspace, "bin", "mem.exe")
    writeFileSync(original, buildMemoryPe())
    writeFileSync(memory, buildMemoryPe())

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-pe-hybrid-rebuild.ts")
      const out = await mod.default.execute(
        { original: "../bin/orig.exe", memoryImage: "../bin/mem.exe", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const payload = JSON.parse(String(out))
      expect(payload.original).toBe(original)
      expect(payload.memory_image).toBe(memory)
      expect(payload.output.replace(/\\/g, "/")).toBe("../work/rev-hybrid-rebuild/orig_hybrid_unpacked.exe")
      expect(existsSync(join(workspace, "work", "rev-hybrid-rebuild", "orig_hybrid_unpacked.exe"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-rev-pe-slice resolves PE from challenge and runs objdump near target", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-pe-slice")
    const target = join(workspace, "bin", "sample.exe")
    writeFileSync(target, buildMemoryPe())
    const execSpy = vi
      .spyOn(execUtils, "safeExec")
      .mockResolvedValue({ ok: true, exitCode: 0, output: "DLL Name: KERNEL32.dll\nVirtualAlloc\nret" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-rev-pe-slice.ts")
      const out = await mod.default.execute({ target: "../bin/sample.exe", keyword: "VirtualAlloc", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.target).toBe(target)
      expect(payload.suspicious_imports.join("\n")).toContain("VirtualAlloc")
    } finally {
      process.chdir(prev)
    }

    expect(execSpy.mock.calls.every((call) => call[2] === dirname(target))).toBe(true)
  })

  it("ctf-rev-analyze forwards challenge directory and worktree to delegated probes", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-rev-analyze")
    const target = join(workspace, "bin", "sample.exe")
    writeFileSync(target, Buffer.concat([buildMemoryPe(), Buffer.from("flag{revctx}\0")]))
    vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: true, exitCode: 0, output: "probe-ok" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-rev-analyze.ts")
      const out = await mod.default.execute({ target: "../bin/sample.exe", slice: false, jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.target).toBe(target)
      expect(payload.route).toBe("pe")
      expect(String(payload.probe)).toContain("flag{revctx}")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-rev-pe-recovery writes recovery artifacts under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-pe-recovery")
    const target = join(workspace, "bin", "rebuilt.exe")
    writeFileSync(target, buildMemoryPe())

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-rev-pe-recovery.ts")
      const out = await mod.default.execute({ target: "../bin/rebuilt.exe", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.target).toBe(target)
      expect(payload.outputs.ghidra_script.replace(/\\/g, "/")).toBe("../work/rev-pe-recovery/recover_pdata.py")
      expect(existsSync(join(workspace, "work", "rev-pe-recovery", "recover_pdata.py"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-rev live dump and unicorn replay helpers keep generated artifacts under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-live-unicorn")
    const target = join(workspace, "bin", "runner")
    const payloadFile = join(workspace, "bin", "payload.bin")
    writeFileSync(target, "#!/bin/sh\necho READY\n", "utf8")
    writeFileSync(payloadFile, "payload", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const live = await import("../tools/rev/ctf-rev-live-memory-dump.ts")
      const liveOut = await live.default.execute({ target: "../bin/runner", workdir: "../bin", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const livePayload = JSON.parse(String(liveOut))
      expect(livePayload.target).toBe(target)
      expect(livePayload.workdir).toBe(join(workspace, "bin"))
      expect(livePayload.helper_script.replace(/\\/g, "/")).toBe("../work/rev-live-dump/rev_live_dump.sh")
      expect(existsSync(join(workspace, "work", "rev-live-dump", "rev_live_dump.sh"))).toBe(true)

      const replay = await import("../tools/rev/ctf-rev-unicorn-replay-builder.ts")
      const replayOut = await replay.default.execute(
        { payloadFile: "../bin/payload.bin", arch: "x86", mode: "64", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const replayPayload = JSON.parse(String(replayOut))
      expect(replayPayload.payload_file.replace(/\\/g, "/")).toBe("../bin/payload.bin")
      expect(replayPayload.replay_script.replace(/\\/g, "/")).toBe("../work/rev-unicorn-replay/unicorn_replay.py")
      expect(existsSync(join(workspace, "work", "rev-unicorn-replay", "unicorn_replay.py"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it.skipIf(process.platform !== "win32")(
    "ctf-runtime-dump uses worktree outDir, challenge-relative launchTarget, and outDir cwd",
    async () => {
      const { workspace, challenge, other } = setupWorkspace("ctf-runtime-dump")
      const launchTarget = join(workspace, "bin", "packed.exe")
      writeFileSync(launchTarget, "MZ", "latin1")
      const pe = buildMemoryPe()
      vi.resetModules()
      const freshExecUtils = await import("../tools/lib/exec-utils.ts")
      const streamSpy = vi
        .spyOn(freshExecUtils, "safeExecWithStreams")
        .mockImplementation(async (_cmd, args, options) => {
          const outDir = String(args[args.indexOf("-OutDir") + 1])
          writeFileSync(join(outDir, "packed.exe.bin"), pe)
          return {
            ok: true,
            exitCode: 0,
            stdout: JSON.stringify({
              ok: true,
              pid: 123,
              process_name: "packed",
              mode: "pe",
              modules: [
                { name: "packed.exe", base: 0x140000000, size: pe.length, magic: 0x20b, size_of_image: pe.length },
              ],
              regions: 1,
              total_bytes: pe.length,
            }),
            stderr: "",
          }
        })

      const prev = process.cwd()
      process.chdir(other)
      try {
        const mod = await import("../tools/rev/ctf-runtime-dump.ts")
        const out = await mod.default.execute(
          { launchTarget: "../bin/packed.exe", outDir: "work/custom-runtime", jsonOnly: true },
          { directory: challenge, worktree: workspace } as never,
        )
        const payload = JSON.parse(String(out))
        expect(payload.script.replace(/\\/g, "/")).toBe("../work/custom-runtime/runtime_dump.ps1")
        expect(payload.rebuilt[0].output.replace(/\\/g, "/")).toBe("../work/custom-runtime/rebuild_packed.exe.exe")
        expect(existsSync(join(workspace, "work", "custom-runtime", "runtime-dump.json"))).toBe(true)
      } finally {
        process.chdir(prev)
      }

      const call = streamSpy.mock.calls[0]
      expect(call[2]?.cwd).toBe(join(workspace, "work", "custom-runtime"))
      expect(String(call[1][call[1].indexOf("-LaunchTarget") + 1])).toBe(launchTarget)
      expect(String(call[1][call[1].indexOf("-OutDir") + 1])).toBe(join(workspace, "work", "custom-runtime"))
    },
  )

  it("ctf-one-shot-triage resolves target relative to context.directory while allowing sibling challenge assets", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-one-shot")
    const target = join(workspace, "bin", "notes.txt")
    writeFileSync(target, "this bundle mentions flag{oneshot_ctx} and app.py", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-one-shot-triage.ts")
      const out = await mod.default.execute({ target: "../bin/notes.txt", maxFiles: 5 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain(`target: ${target}`)
      expect(String(out)).toContain("flag_candidate")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-rev-closure-ladder writes plans under worktree when context.directory is a challenge subdir", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-closure")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/rev/ctf-rev-closure-ladder.ts")
      const out = await mod.default.execute(
        { evidence: "checker uses xor transform and z3 constraints", outDir: "work/custom-closure" },
        { directory: challenge, worktree: workspace } as never,
      )
      expect(existsSync(join(workspace, "work", "custom-closure", "closure-plan.json"))).toBe(true)
      expect(String(out).replace(/\\/g, "/")).toContain("closure_plan_path: ../work/custom-closure/closure-plan.json")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-local-harness-verifier reads challenge-relative harnesses and executes near that harness", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-harness")
    const harness = join(workspace, "bin", "harness.py")
    writeFileSync(harness, "print('[CONFIRMED] payload captured')\n", "utf8")
    vi.resetModules()
    const freshExecUtils = await import("../tools/lib/exec-utils.ts")
    const streamSpy = vi.spyOn(freshExecUtils, "safeExecWithStreams").mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "[CONFIRMED] payload captured\n",
      stderr: "",
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-local-harness-verifier.ts")
      const out = await mod.default.execute(
        { operation: "run", language: "python", harnessFile: "../bin/harness.py", allowRun: true, jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const payload = JSON.parse(String(out))
      expect(payload.verdict).toBe("confirmed")
      expect(payload.harness_file.replace(/\\/g, "/")).toBe("../bin/harness.py")
      expect(streamSpy.mock.calls[0][2]?.cwd).toBe(join(workspace, "bin"))
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-local-harness-verifier writes generated harnesses under worktree, not challenge subdir", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-harness-write")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-local-harness-verifier.ts")
      const out = await mod.default.execute(
        {
          operation: "write",
          language: "python",
          outDir: "work/harness-out",
          findingJson: JSON.stringify({ id: "ctx" }),
        },
        { directory: challenge, worktree: workspace } as never,
      )
      expect(String(out).replace(/\\/g, "/")).toContain("harness written: work/harness-out/")
      expect(existsSync(join(workspace, "work", "harness-out"))).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-java-source-slice resolves source roots from context.directory inside worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-java-slice")
    const src = join(workspace, "src", "main", "java", "ctf")
    mkdirSync(src, { recursive: true })
    writeFileSync(
      join(src, "DemoController.java"),
      'import org.springframework.web.bind.annotation.*; class DemoController { @GetMapping("/flag") String f(@RequestParam String q){ return q; } }',
      "utf8",
    )

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/java/ctf-java-source-slice.ts")
      const out = await mod.default.execute({ target: "../src" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain("route-file:")
      expect(String(out)).toContain("DemoController.java")
    } finally {
      process.chdir(prev)
    }
  })

  it("doc-read is optional-context safe and runs helper from context.directory", async () => {
    vi.resetModules()
    const { workspace, challenge, other } = setupWorkspace("ctf-doc-read")
    const target = join(workspace, "bin", "note.txt")
    const helperDir = join(workspace, "tools", "core")
    mkdirSync(helperDir, { recursive: true })
    writeFileSync(target, "hello", "utf8")
    writeFileSync(join(helperDir, "document_extract.py"), "# mocked by test\n", "utf8")
    const spawnCalls: any[] = []
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn((_cmd: string, _args: string[], opts: any) => {
        spawnCalls.push({ opts })
        const proc = new EventEmitter() as any
        proc.stdout = new PassThrough()
        proc.stderr = new PassThrough()
        proc.stdin = new PassThrough()
        let input = ""
        proc.stdin.on("data", (d: Buffer) => (input += d.toString()))
        proc.stdin.on("finish", () => {
          const payload = JSON.parse(input)
          proc.stdout.write(JSON.stringify({ target: payload.target }))
          proc.stdout.end()
          proc.stderr.end()
          setImmediate(() => proc.emit("close", 0))
        })
        return proc
      }),
    }))

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/doc-read.ts")
      const out = await mod.default.execute({ target: "../bin/note.txt", maxChars: 100 }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(JSON.parse(String(out)).target.replace(/\\/g, "/")).toMatch(
        /ctf-doc-read-workspace-[^/]+\/bin\/note\.txt$/,
      )
      expect(spawnCalls[0].opts.cwd.replace(/\\/g, "/")).toMatch(/ctf-doc-read-workspace-[^/]+\/challenge$/)
    } finally {
      process.chdir(prev)
      vi.doUnmock("node:child_process")
      vi.resetModules()
    }
  })

  it("pwn payload/session/runner tools keep challenge inputs and worktree artifacts separated", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-pwn-context")
    const basePayload = join(workspace, "bin", "base.bin")
    const binary = join(workspace, "bin", "chall")
    const solverDir = join(workspace, "solvers")
    mkdirSync(solverDir, { recursive: true })
    const script = join(solverDir, "solve.py")
    writeFileSync(basePayload, Buffer.from("414243", "hex"))
    writeFileSync(binary, Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]), Buffer.alloc(32)]))
    writeFileSync(script, "print('no flag yet')\n", "utf8")

    vi.resetModules()
    const freshExecUtils = await import("../tools/lib/exec-utils.ts")
    const streamSpy = vi.spyOn(freshExecUtils, "safeExecWithStreams").mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "ran\n",
      stderr: "",
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const artifact = await import("../tools/pwn/ctf-pwn-payload-artifact.ts")
      const artifactOut = await artifact.default.execute(
        {
          fromFile: "../bin/base.bin",
          output: "work/payloads/out.bin",
          patchesJson: JSON.stringify([{ offset: 3, text: "D" }]),
          jsonOnly: true,
        },
        { directory: challenge, worktree: workspace } as never,
      )
      const artifactPayload = JSON.parse(String(artifactOut))
      expect(artifactPayload.output.replace(/\\/g, "/")).toBe("../work/payloads/out.bin")
      expect(existsSync(join(workspace, "work", "payloads", "out.bin"))).toBe(true)

      const session = await import("../tools/pwn/ctf-pwn-linux-session.ts")
      const sessionOut = await session.default.execute(
        { binary: "../bin/chall", outDir: "work/pwn-sessions", jsonOnly: true },
        { directory: challenge, worktree: workspace } as never,
      )
      const sessionPayload = JSON.parse(String(sessionOut))
      expect(sessionPayload.binary.replace(/\\/g, "/")).toBe("bin/chall")
      expect(sessionPayload.binary_display.replace(/\\/g, "/")).toBe("../bin/chall")
      expect(sessionPayload.docker_runner_defaults.containerWorkdir).toBe("/work/bin")
      expect(existsSync(join(workspace, "work", "pwn-sessions", `${sessionPayload.session_id}.json`))).toBe(true)

      const runner = await import("../tools/pwn/ctf-pwn-runner.ts")
      await runner.default.execute(
        {
          script: "../solvers/solve.py",
          saveLastAttempt: true,
          payloadHex: "4142",
          payloadLabel: "ctx",
          jsonOnly: true,
        },
        { directory: challenge, worktree: workspace } as never,
      )
      expect(existsSync(join(workspace, "work", "last_attempt.py"))).toBe(true)
      expect(existsSync(join(workspace, "work", "pwn_runner_payloads"))).toBe(true)
      expect(String(streamSpy.mock.calls[0][2]?.cwd).replace(/\\/g, "/")).toMatch(
        /ctf-pwn-context-workspace-[^/]+\/solvers$/,
      )
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-decision-state defaults to worktree-root state and keeps chain state adjacent", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-decision-ctx")
    writeFileSync(join(workspace, ".ctf-chain-state.json"), JSON.stringify({ chains: [] }), "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/core/ctf-decision-state.ts")
      const out = await mod.default.execute({ operation: "init" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(existsSync(join(workspace, ".ctf-decision-state.json"))).toBe(true)
      expect(existsSync(join(challenge, ".ctf-decision-state.json"))).toBe(false)
      expect(String(out)).toContain("mode: medium")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-whitebox-handoff stores state under worktree and verifies sibling source evidence", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-whitebox-ctx")
    const source = join(workspace, "src", "Demo.java")
    mkdirSync(join(workspace, "src"), { recursive: true })
    writeFileSync(source, "class Demo { void sink() {} }\n", "utf8")

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/web/ctf-whitebox-handoff.ts")
      const initOut = await mod.default.execute({ operation: "init", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(existsSync(join(workspace, ".ctf-whitebox-handoff.json"))).toBe(true)
      expect(existsSync(join(challenge, ".ctf-whitebox-handoff.json"))).toBe(false)

      const gate = await mod.default.execute(
        {
          operation: "gate",
          findingJson: JSON.stringify({ id: "f1", file: "../src/Demo.java", line: 1, snippet: "void sink()" }),
          gateJson: JSON.stringify({ controllability: "user", sink_or_condition: "sink", oracle_or_harness: "mock" }),
        },
        { directory: challenge, worktree: workspace } as never,
      )
      const gateResult = JSON.parse(String(gate))
      expect(gateResult.verdict).toBe("confirmed")
    } finally {
      process.chdir(prev)
    }
  })

  it("ctf-stego-probe resolves sibling media targets and runs probes near the artifact", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-stego-ctx")
    const target = join(workspace, "bin", "img.png")
    writeFileSync(target, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("flag{stegoctx}")]))
    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({
      ok: true,
      exitCode: 0,
      output: "stub",
    })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/forensics/ctf-stego-probe.ts")
      const out = await mod.default.execute({ target: "../bin/img.png" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(String(out)).toContain(`target: ${target}`)
      expect(String(out)).toContain("flag{stegoctx}")
    } finally {
      process.chdir(prev)
    }
    expect(execSpy.mock.calls.every((call) => call[2] === join(workspace, "bin"))).toBe(true)
  })

  it("ctf-stego-triage writes evidence under worktree while probing near target", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-stego-triage")
    const target = join(workspace, "bin", "note.png")
    writeFileSync(target, "fake-png", "utf8")
    const execSpy = vi.spyOn(execUtils, "safeExec").mockResolvedValue({ ok: true, exitCode: 0, output: "stub" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/forensics/ctf-stego-triage.ts")
      await mod.default.execute({ target: "../bin/note.png", caseId: "stego-case" }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      expect(existsSync(join(workspace, "work", "ctf-evidence", "stego-case", "artifacts", "stego"))).toBe(true)
      expect(existsSync(join(challenge, "work", "ctf-evidence"))).toBe(false)
    } finally {
      process.chdir(prev)
    }
    expect(execSpy.mock.calls.every((call) => call[2] === join(workspace, "bin"))).toBe(true)
  })

  it("ctf-pwn-libc-runtime-doctor writes workspace-relative runtime profiles under worktree", async () => {
    const { workspace, challenge, other } = setupWorkspace("ctf-libc-doctor")
    const binary = join(workspace, "bin", "chall")
    const libc = join(workspace, "bin", "libc.so.6")
    writeFileSync(binary, Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]), Buffer.alloc(32)]))
    writeFileSync(libc, "GNU C Library stable release version 2.35", "latin1")
    vi.resetModules()
    const freshExecUtils = await import("../tools/lib/exec-utils.ts")
    const execSpy = vi
      .spyOn(freshExecUtils, "safeExec")
      .mockResolvedValue({ ok: true, exitCode: 0, output: "ELF 64-bit" })

    const prev = process.cwd()
    process.chdir(other)
    try {
      const mod = await import("../tools/pwn/ctf-pwn-libc-runtime-doctor.ts")
      const out = await mod.default.execute({ binary: "../bin/chall", libc: "../bin/libc.so.6", jsonOnly: true }, {
        directory: challenge,
        worktree: workspace,
      } as never)
      const payload = JSON.parse(String(out))
      expect(payload.binary.replace(/\\/g, "/")).toBe("bin/chall")
      expect(payload.binary_display.replace(/\\/g, "/")).toBe("../bin/chall")
      expect(payload.docker_runner_defaults.containerWorkdir).toBe("/work/bin")
      expect(existsSync(join(workspace, "work", "pwn-runtime-profiles", `${payload.profile_id}.json`))).toBe(true)
    } finally {
      process.chdir(prev)
    }
    expect(execSpy.mock.calls[0][2]).toBe(join(workspace, "bin"))
  })
})


