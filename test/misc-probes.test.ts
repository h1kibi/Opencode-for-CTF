import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("Misc dedicated probe contracts", () => {
  it("rejects invalid DNS input before attempting a resolver", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-misc-dns-invalid-"))
    roots.push(root)
    const mod = await import("../tools/misc/ctf-dns-probe.ts")
    const output = JSON.parse(
      String(
        await mod.default.execute(
          { domain: "not a domain", recordTypes: ["TXT"], jsonOnly: true },
          { directory: root, worktree: root } as never,
        ),
      ),
    )
    expect(output.schemaVersion).toBe("misc_dns.v1")
    expect(output.status).toBe("blocked")
    expect(output.backend).toBe("none")
    expect(output.records).toEqual([])
  })

  it("rejects unsupported DNS record selections instead of widening the query", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-misc-dns-types-"))
    roots.push(root)
    const mod = await import("../tools/misc/ctf-dns-probe.ts")
    const output = JSON.parse(
      String(
        await mod.default.execute(
          { domain: "example.com", recordTypes: ["ANY", "AXFR"], jsonOnly: true },
          { directory: root, worktree: root } as never,
        ),
      ),
    )
    expect(output.requestedTypes).toEqual([])
    expect(output.status).toBe("blocked")
    expect(output.error).toContain("invalid domain or record type selection")
  })

  it("keeps QR probing inside the active workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-misc-qr-path-"))
    roots.push(root)
    const mod = await import("../tools/misc/ctf-qr-probe.ts")
    await expect(
      mod.default.execute(
        { target: "../outside.png", jsonOnly: true },
        { directory: root, worktree: root } as never,
      ),
    ).rejects.toThrow(/inside the current workspace|escapes the workspace/)
  })
})
