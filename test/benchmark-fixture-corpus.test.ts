import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.js"

const root = process.cwd()

describe("benchmark fixture corpus", () => {
  it("every declared benchmark id has an expected_behavior fixture", () => {
    const missing: string[] = []
    for (const entry of benchmarkFamilies) {
      const rel = join("benchmarks", entry.family, entry.name, "expected_behavior.md")
      if (!existsSync(join(root, rel))) missing.push(rel)
    }
    expect(missing).toEqual([])
  })

  it("seed fixtures follow the expected behavior template", () => {
    const seeds = benchmarkFamilies.map((entry) =>
      join(root, "benchmarks", entry.family, entry.name, "expected_behavior.md"),
    )
    for (const file of seeds) {
      const body = readFileSync(file, "utf8")
      expect(body).toContain("## Goal")
      expect(body).toContain("## Expected Behavior")
      expect(body).toContain("## Bad Behaviors")
    }
  })

  it("does not leave expected-behavior fixtures orphaned from the registry", () => {
    const indexed = new Set(benchmarkFamilies.map((entry) => `${entry.family}/${entry.name}`))
    const orphaned: string[] = []

    for (const familyEntry of readdirSync(join(root, "benchmarks"), { withFileTypes: true })) {
      if (!familyEntry.isDirectory()) continue
      const familyDir = join(root, "benchmarks", familyEntry.name)
      for (const benchmarkEntry of readdirSync(familyDir, { withFileTypes: true })) {
        if (!benchmarkEntry.isDirectory()) continue
        const fixture = `${familyEntry.name}/${benchmarkEntry.name}`
        if (existsSync(join(familyDir, benchmarkEntry.name, "expected_behavior.md")) && !indexed.has(fixture)) {
          orphaned.push(fixture)
        }
      }
    }

    expect(orphaned).toEqual([])
  })
})
