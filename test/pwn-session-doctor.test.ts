import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeTestWorkspace } from "./support/test-workspace.ts"
import { describe, expect, it } from "vitest"

function fakeElf(machine = 0x3e) {
  const buf = Buffer.alloc(64, 0)
  buf.write("\x7fELF", 0, "latin1")
  buf.writeUInt16LE(machine, 18)
  return buf
}

function workspace() {
  const dir = makeTestWorkspace("ctf-doc")
  mkdirSync(join(dir, "chall"), { recursive: true })
  writeFileSync(join(dir, "chall", "pwn1"), fakeElf())
  const prev = process.cwd()
  process.chdir(dir)
  return { dir, prev }
}

async function loadTool(rel: string) {
  const mod = await import(`../${rel}`)
  return mod.default as unknown as { execute: (args: Record<string, unknown>, context?: unknown) => Promise<string> }
}

describe("ctf-pwn-session-doctor (resync/invariant primitives)", () => {
  it("locks a session with a hash baseline, detects tampering, and resyncs with an audit trail", async () => {
    const { dir, prev } = workspace()
    try {
      const lock = await loadTool("tools/pwn/ctf-pwn-linux-session.ts")
      const doctor = await loadTool("tools/pwn/ctf-pwn-session-doctor.ts")

      const lockOut = await lock.execute({ binary: "chall/pwn1" }, { directory: dir, worktree: dir })
      expect(lockOut).toContain("PWN_LINUX_SESSION")

      const sessionId = "pwn1-general-session"
      const ok = await doctor.execute({ action: "check", sessionId }, { directory: dir, worktree: dir })
      expect(ok).toContain("status: OK")
      expect(ok).toContain("binary_sha256: ok")

      // Tamper: replace the binary after lock -> hash drift.
      writeFileSync(join(dir, "chall", "pwn1"), fakeElf(0x03))
      const drifted = await doctor.execute({ action: "check", sessionId }, { directory: dir, worktree: dir })
      expect(drifted).toContain("status: DRIFT")
      expect(drifted).toContain("hash changed since lock")
      expect(drifted).toContain("action=resync")

      // Resync requires a reason.
      const noReason = await doctor.execute({ action: "resync", sessionId }, { directory: dir, worktree: dir })
      expect(noReason).toContain("requires a reason")

      // Resync re-baselines and records history.
      const resynced = await doctor.execute(
        { action: "resync", sessionId, reason: "binary swapped to i386 build by teammate" },
        { directory: dir, worktree: dir },
      )
      expect(resynced).toContain("re-baselined")
      expect(resynced).toContain("post-check: OK")

      const okAgain = await doctor.execute({ action: "check", sessionId }, { directory: dir, worktree: dir })
      expect(okAgain).toContain("status: OK")
    } finally {
      process.chdir(prev)
    }
  })

  it("refuses to resync a clean session and reports missing sessions clearly", async () => {
    const { dir, prev } = workspace()
    try {
      const lock = await loadTool("tools/pwn/ctf-pwn-linux-session.ts")
      const doctor = await loadTool("tools/pwn/ctf-pwn-session-doctor.ts")
      await lock.execute({ binary: "chall/pwn1" }, { directory: dir, worktree: dir })

      const clean = await doctor.execute(
        { action: "resync", sessionId: "pwn1-general-session", reason: "no real change" },
        { directory: dir, worktree: dir },
      )
      expect(clean).toContain("Nothing to resync")

      const missing = await doctor.execute({ action: "check", sessionId: "nope" }, { directory: dir, worktree: dir })
      expect(missing).toContain("ERROR: session not found")
    } finally {
      process.chdir(prev)
    }
  })
})
