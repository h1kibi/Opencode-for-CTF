import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const agents = [
  "agents/ctf-web.md",
  "agents/ctf-pwn.md",
  "agents/ctf-rev.md",
  "agents/ctf-crypto.md",
  "agents/ctf-forensics.md",
  "agents/ctf-misc.md",
] as const

describe("agent wrapper doctrine dedup", () => {
  it("shared wrapper doctrine source exists", () => {
    expect(existsSync(join(root, "skills/ctf-common/references/specialist-wrapper-doctrine.md"))).toBe(true)
  })

  it("specialist agents still delegate shared discipline explicitly", () => {
    for (const rel of agents) {
      const body = readFileSync(join(root, rel), "utf8")
      expect(body).toContain("ctf-common")
      expect(body).toContain("ctf-decision-engine")
      expect(body).toContain("ctf-experience-gate")
    }
  })

  it("category-specific ownership text still exists in each specialist agent", () => {
    const expectations: Array<[string, string]> = [
      ["agents/ctf-web.md", "You are a Web coordinator"],
      ["agents/ctf-pwn.md", "PWN SPECIALIST BOUNDARY"],
      ["agents/ctf-rev.md", "Rev specialist boundary"],
      ["agents/ctf-crypto.md", "Crypto specialist boundary"],
      ["agents/ctf-forensics.md", "Forensics specialist boundary"],
      ["agents/ctf-misc.md", "Misc specialist boundary"],
    ]
    for (const [rel, needle] of expectations) {
      const body = readFileSync(join(root, rel), "utf8")
      expect(body).toContain(needle)
    }
  })
})
