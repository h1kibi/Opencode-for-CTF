import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

const commands = [
  "ctf-web",
  "ctf-pwn",
  "ctf-rev",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
] as const

describe("family command entrypoints", () => {
  it("commands mention their skill stack and reference-index-first contract", () => {
    for (const command of commands) {
      const body = readFileSync(join(root, "commands", `${command}.md`), "utf8")
      expect(body).toContain("Use `ctf-common`")
      expect(body).toContain("Challenge/target:")
      expect(body).toContain("Create or update `notes.md`.")
      expect(body).toContain("REFERENCE_INDEX.md")
    }
  })

  it("commands mention pivot or escalation guidance", () => {
    for (const command of commands) {
      const body = readFileSync(join(root, "commands", `${command}.md`), "utf8")
      expect(body).toMatch(/Pivot|Escalate/)
    }
  })
})
