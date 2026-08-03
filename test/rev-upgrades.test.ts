import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { packForTool } from "../src/tool-packs.ts"

const execFileAsync = promisify(execFile)

async function tempRoot(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

describe("Rev upgrade contracts", () => {
  it("keeps the closure planner in the base Rev pack while runtime helpers stay heavy", () => {
    expect(packForTool("ctf-rev-closure-ladder")).toBe("rev")
    expect(packForTool("ctf-rev-live-memory-dump")).toBe("rev-heavy")
    expect(packForTool("ctf-rev-unicorn-replay-builder")).toBe("rev-heavy")
  })

  it("normalizes x86_64 and emits architecture-correct Unicorn imports and register values", async () => {
    const mod = await import("../tools/rev/ctf-rev-unicorn-replay-builder.ts")
    const root = await tempRoot("ctf-rev-replay-")
    await writeFile(path.join(root, "payload.bin"), Buffer.from([0xc3]))

    const out = await mod.default.execute(
      {
        payloadFile: "payload.bin",
        arch: "x86_64",
        mode: "64",
        regsJson: JSON.stringify({ UC_X86_REG_RAX: "0x2" }),
        outDir: "replay",
        jsonOnly: true,
      },
      { directory: root, worktree: root } as never,
    )
    const payload = JSON.parse(String(out))
    const script = await readFile(path.join(root, "replay", "unicorn_replay.py"), "utf8")

    expect(payload.arch).toBe("x86")
    expect(payload.input_arch).toBe("x86_64")
    expect(payload.register_const_module).toBe("x86_const")
    expect(script).toContain("from unicorn.x86_const import *")
    expect(script).toContain("ARCH = UC_ARCH_X86")
    expect(script).toContain('mu.reg_write(UC_X86_REG_RAX, int("0x2", 0))')
    expect(script).not.toContain("<ARCH>")
    await execFileAsync("python", ["-m", "py_compile", path.join(root, "replay", "unicorn_replay.py")])
  })

  it("rejects unsupported Unicorn architectures instead of emitting placeholders", async () => {
    const mod = await import("../tools/rev/ctf-rev-unicorn-replay-builder.ts")
    const root = await tempRoot("ctf-rev-replay-")
    await writeFile(path.join(root, "payload.bin"), Buffer.from([0]))

    await expect(
      mod.default.execute({ payloadFile: "payload.bin", arch: "sparc", mode: "32", outDir: "replay" }, {
        directory: root,
        worktree: root,
      } as never),
    ).rejects.toThrow("unsupported Unicorn arch")
  })

  it("emits a quoted argv array and never uses eval in live dump helpers", async () => {
    const mod = await import("../tools/rev/ctf-rev-live-memory-dump.ts")
    const root = await tempRoot("ctf-rev-live-")
    await writeFile(path.join(root, "target"), Buffer.from("fixture"))

    const out = await mod.default.execute(
      {
        target: "target",
        argvJson: JSON.stringify(["--mode", "test value", "$(touch pwned)"]),
        outDir: "live",
        jsonOnly: true,
      },
      { directory: root, worktree: root } as never,
    )
    const payload = JSON.parse(String(out))

    expect(payload.argv).toEqual(["--mode", "test value", "$(touch pwned)"])
    expect(payload.helper_script_preview).toContain("TARGET_ARGS=")
    expect(payload.helper_script_preview).toContain('"$TARGET" "${TARGET_ARGS[@]}"')
    expect(payload.helper_script_preview).not.toContain("eval ")
    expect(payload.helper_script_preview).not.toContain("ARGV=")
  })

  it("writes a closure ledger and synchronizes an existing decision state", async () => {
    const mod = await import("../tools/rev/ctf-rev-closure-ladder.ts")
    const root = await tempRoot("ctf-rev-closure-")
    const statePath = path.join(root, ".ctf-decision-state.json")
    await writeFile(statePath, "{}", "utf8")

    const out = await mod.default.execute(
      {
        evidence: "checker compare with xor transform",
        primitive: "xor_table",
        outDir: "closure",
        decisionStatePath: ".ctf-decision-state.json",
        jsonOnly: true,
      },
      { directory: root, worktree: root } as never,
    )
    const payload = JSON.parse(String(out))
    const ledger = await readFile(path.join(root, "closure", "rev-closure-ledger.md"), "utf8")
    const state = JSON.parse(await readFile(statePath, "utf8"))

    expect(payload.ledger_path).toContain("rev-closure-ledger.md")
    expect(payload.decision_state_sync.synced).toBe(true)
    expect(ledger).toContain("checker_extraction")
    expect(state.history.some((item: { kind?: string }) => item.kind === "closure_probe")).toBe(true)
  })
})
