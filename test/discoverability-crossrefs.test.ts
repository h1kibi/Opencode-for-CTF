import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.js"

const root = process.cwd()
const families = ["web", "pwn", "rev", "crypto", "forensics", "misc"] as const

function text(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

describe("discoverability and cross references", () => {
  it("reference indexes exist for all major families", () => {
    const refs = [
      "skills/ctf-web/references/REFERENCE_INDEX.md",
      "skills/ctf-pwn/references/REFERENCE_INDEX.md",
      "skills/ctf-rev/references/REFERENCE_INDEX.md",
      "skills/ctf-crypto/references/REFERENCE_INDEX.md",
      "skills/ctf-forensics/references/REFERENCE_INDEX.md",
      "skills/ctf-misc/references/REFERENCE_INDEX.md",
    ]
    for (const rel of refs) expect(existsSync(join(root, rel))).toBe(true)
  })

  it("main skills mention their reference indexes and pivot guidance", () => {
    const cases = [
      ["skills/ctf-web/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
      ["skills/ctf-pwn/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
      ["skills/ctf-rev/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
      ["skills/ctf-crypto/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
      ["skills/ctf-forensics/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
      ["skills/ctf-misc/SKILL.md", "references/REFERENCE_INDEX.md", "## When to Pivot"],
    ] as const
    for (const [rel, ref, pivot] of cases) {
      const body = text(rel)
      expect(body).toContain(ref)
      expect(body).toContain(pivot)
    }
  })

  it("benchmark metadata includes all families", () => {
    const coveredFamilies = new Set(benchmarkFamilies.map((entry) => entry.family))
    for (const family of families) {
      expect(coveredFamilies.has(family)).toBe(true)
    }
  })
})
