import { existsSync, readFileSync } from "node:fs"
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
    const seeds = benchmarkFamilies.map((entry) => join(root, "benchmarks", entry.family, entry.name, "expected_behavior.md"))
    for (const file of seeds) {
      const body = readFileSync(file, "utf8")
      expect(body).toContain("## Goal")
      expect(body).toContain("## Expected Behavior")
      expect(body).toContain("## Bad Behaviors")
    }
  })
})
