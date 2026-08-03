import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("tool doctor script paths", () => {
  it("points Go/REV doctor checks at recursive tool directories", () => {
    const doctor = readFileSync("scripts/doctor-go-rev.ts", "utf8")

    expect(doctor).toContain('"tools", "core", "ctf-binary-probe.ts"')
    expect(doctor).toContain('"tools", "core", "ctf-elf-slice.ts"')
    expect(doctor).toContain('"tools", "rev", "ctf-go-pclntool.ts"')
    expect(doctor).not.toContain('"tools", "ctf-go-pclntool.ts"')
    expect(doctor).not.toContain('"tools", "ctf-elf-slice.ts"')
  })
})
