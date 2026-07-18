import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const families = ["web", "pwn", "rev", "crypto", "forensics", "misc"] as const

describe("reference and command cross references", () => {
  it("reference indexes only point to existing local reference files when not explicitly external", () => {
    const indexFiles = [
      "skills/ctf-web/references/REFERENCE_INDEX.md",
      "skills/ctf-pwn/references/REFERENCE_INDEX.md",
      "skills/ctf-rev/references/REFERENCE_INDEX.md",
      "skills/ctf-crypto/references/REFERENCE_INDEX.md",
      "skills/ctf-forensics/references/REFERENCE_INDEX.md",
      "skills/ctf-misc/references/REFERENCE_INDEX.md",
    ]

    const allowedMissing = new Set([
      "skills/ctf-crypto/references/symmetric-modes.md",
      "skills/ctf-crypto/references/stream-reuse.md",
      "skills/ctf-crypto/references/ecc-signatures.md",
      "skills/ctf-crypto/references/prng-state-recovery.md",
      "skills/ctf-crypto/references/classical-encoding-chain.md",
    ])

    for (const rel of indexFiles) {
      const body = readFileSync(join(root, rel), "utf8")
      const lines = body.split(/\r?\n/)
      for (const line of lines) {
        const match = line.match(/`([^`]+\.md)`/)
        if (!match) continue
        const ref = match[1]
        if (ref.startsWith("../../../")) continue
        const resolvedRel = `${rel.substring(0, rel.lastIndexOf("/"))}/${ref}`
        const resolved = join(root, resolvedRel)
        if (allowedMissing.has(resolvedRel)) continue
        expect(existsSync(resolved)).toBe(true)
      }
    }
  })

  it("commands point to an existing family reference index", () => {
    const commandToIndex: Record<(typeof families)[number], string> = {
      web: "skills/ctf-web/references/REFERENCE_INDEX.md",
      pwn: "skills/ctf-pwn/references/REFERENCE_INDEX.md",
      rev: "skills/ctf-rev/references/REFERENCE_INDEX.md",
      crypto: "skills/ctf-crypto/references/REFERENCE_INDEX.md",
      forensics: "skills/ctf-forensics/references/REFERENCE_INDEX.md",
      misc: "skills/ctf-misc/references/REFERENCE_INDEX.md",
    }

    for (const family of families) {
      const commandBody = readFileSync(join(root, "commands", `ctf-${family}.md`), "utf8")
      expect(commandBody).toContain(commandToIndex[family])
      expect(existsSync(join(root, commandToIndex[family]))).toBe(true)
    }
  })
})
