import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("stronger family skill alignment", () => {
  it("rev, pwn, and web skills include contract and pivot sections", () => {
    const revText = readFileSync(join(root, "skills", "ctf-rev", "SKILL.md"), "utf8")
    const pwnText = readFileSync(join(root, "skills", "ctf-pwn", "SKILL.md"), "utf8")
    const webText = readFileSync(join(root, "skills", "ctf-web", "SKILL.md"), "utf8")

    expect(revText).toContain("## Contract")
    expect(revText).toContain("## When to Pivot")
    expect(revText).toContain("references/REFERENCE_INDEX.md")

    expect(pwnText).toContain("## Contract")
    expect(pwnText).toContain("## When to Pivot")
    expect(pwnText).toContain("references/REFERENCE_INDEX.md")

    expect(webText).toContain("## Contract")
    expect(webText).toContain("## When to Pivot")
    expect(webText).toContain("references/REFERENCE_INDEX.md")
  })

  it("rev reference index exists", () => {
    expect(existsSync(join(root, "skills", "ctf-rev", "references", "REFERENCE_INDEX.md"))).toBe(true)
  })
})
