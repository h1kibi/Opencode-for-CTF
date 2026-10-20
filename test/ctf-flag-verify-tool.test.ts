import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("ctf-flag-verify tool", () => {
  it("keeps a strict-shaped value pending until an independent oracle is supplied", async () => {
    const verifier = (await import("../tools/core/ctf-flag-verify.ts")).default
    const output = String(
      await verifier.execute({ candidatesJson: JSON.stringify(["flag{candidate_payload}"]) }, {
        directory: process.cwd(),
        worktree: process.cwd(),
      } as never),
    )
    expect(output).toContain("status: candidate")
    expect(output).toContain("oracle_verified: false")
    expect(output).toContain("pending_oracle")
  })

  it("accepts an exact independent oracle and rejects malformed candidates", async () => {
    const verifier = (await import("../tools/core/ctf-flag-verify.ts")).default
    const verified = String(
      await verifier.execute(
        {
          candidatesJson: JSON.stringify(["flag{real_payload}", "flag{decoy_payload}"]),
          expectedFlag: "flag{real_payload}",
        },
        { directory: process.cwd(), worktree: process.cwd() } as never,
      ),
    )
    expect(verified).toContain("status: oracle-verified")
    expect(verified).toContain("oracle_verified: true")
    expect(verified).toContain("matched_flag: flag{real_payload}")

    const rejected = String(
      await verifier.execute({ candidate: "flag{short}" }, {
        directory: process.cwd(),
        worktree: process.cwd(),
      } as never),
    )
    expect(rejected).toContain("status: rejected")
    expect(rejected).not.toContain("oracle_verified: true")
  })

  it("uses a workspace-scoped flag file and does not allow path escape", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-flag-verify-tool-"))
    roots.push(root)
    await writeFile(path.join(root, "flag.txt"), "flag{file_oracle_payload}\n", "utf8")
    const verifier = (await import("../tools/core/ctf-flag-verify.ts")).default
    const verified = String(
      await verifier.execute({ candidate: "flag{file_oracle_payload}", flagFile: "flag.txt" }, {
        directory: root,
        worktree: root,
      } as never),
    )
    expect(verified).toContain("status: oracle-verified")

    const escaped = String(
      await verifier.execute({ candidate: "flag{file_oracle_payload}", flagFile: "../outside-flag.txt" }, {
        directory: root,
        worktree: root,
      } as never),
    )
    expect(escaped).toContain("ERROR:")
    expect(escaped).toContain("outside allowed CTF roots")
  })
})
