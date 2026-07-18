import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

describe("family benchmark runners", () => {
  it("benchmark checker scripts exist for all supported families", () => {
    const scripts = [
      "scripts/check-web-benchmarks.ts",
      "scripts/check-pwn-benchmarks.ts",
      "scripts/check-crypto-benchmarks.ts",
      "scripts/check-rev-benchmarks.ts",
      "scripts/check-forensics-benchmarks.ts",
      "scripts/check-misc-benchmarks.ts",
    ]
    for (const rel of scripts) {
      expect(existsSync(join(root, rel))).toBe(true)
    }
  })

  it("ctf-benchmark.ts advertises and routes all family modes", () => {
    const body = require("node:fs").readFileSync(join(root, "scripts", "ctf-benchmark.ts"), "utf8") as string
    for (const mode of ["web", "pwn", "crypto", "rev", "forensics", "misc", "tooling"]) {
      expect(body).toContain(`mode === \"${mode}\"`)
    }
  })
})
