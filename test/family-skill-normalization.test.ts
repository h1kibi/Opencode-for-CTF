import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("family skill normalization", () => {
  it("crypto, forensics, and misc skills reference their index and pivot sections", () => {
    const cryptoText = readText(join(root, "skills", "ctf-crypto", "SKILL.md"))
    const forensicsText = readText(join(root, "skills", "ctf-forensics", "SKILL.md"))
    const miscText = readText(join(root, "skills", "ctf-misc", "SKILL.md"))

    expect(cryptoText).toContain("references/REFERENCE_INDEX.md")
    expect(cryptoText).toContain("## When to Pivot")

    expect(forensicsText).toContain("references/REFERENCE_INDEX.md")
    expect(forensicsText).toContain("## When to Pivot")

    expect(miscText).toContain("references/REFERENCE_INDEX.md")
    expect(miscText).toContain("## When to Pivot")
  })

  it("crypto, forensics, and misc reference indexes exist", () => {
    expect(existsSync(join(root, "skills", "ctf-crypto", "references", "REFERENCE_INDEX.md"))).toBe(true)
    expect(existsSync(join(root, "skills", "ctf-forensics", "references", "REFERENCE_INDEX.md"))).toBe(true)
    expect(existsSync(join(root, "skills", "ctf-misc", "references", "REFERENCE_INDEX.md"))).toBe(true)
  })

  it("crypto and forensics fallback matrices exist", () => {
    expect(existsSync(join(root, "skills", "ctf-crypto", "references", "crypto-fallback-matrix.md"))).toBe(true)
    expect(existsSync(join(root, "skills", "ctf-forensics", "references", "forensics-fallback-matrix.md"))).toBe(true)
  })
})

function readText(filePath: string): string {
  return readFileSync(filePath, "utf8")
}
