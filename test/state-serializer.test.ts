import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeTestWorkspace } from "./support/test-workspace.ts"
import { describe, expect, it } from "vitest"
import { extractScalars, serializeSolveState } from "../src/team/state-serializer.ts"

function fixtureDir() {
  const dir = makeTestWorkspace("ctf-ser")
  const evidenceDir = join(dir, "work", "ctf-evidence", "2610251156")
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(join(dir, "work", "ctf-evidence", ".current"), "2610251156\n")
  writeFileSync(
    join(evidenceDir, ".ctf-evidence-board.json"),
    JSON.stringify({
      challenge: { name: "demo", category: "pwn", flagFormat: "flag{}", target: "nc pwn.example.com 1337" },
      routes: [
        { id: "R1", name: "heap uaf", state: "blocked", nextProbe: "stale pointer into fastbin" },
        { id: "R2", name: "format string", state: "untested" },
      ],
      blockedPaths: ["R1 heap spray: allocator differs from local glibc", "R2 missing remote libc"],
    }),
  )
  return dir
}

describe("state serializer", () => {
  it("serializes board inventory, routes, and blocked paths", async () => {
    const sections = await serializeSolveState(fixtureDir(), { routeId: "R1" })

    expect(sections.inventory).toContain("- category: pwn")
    expect(sections.inventory).toContain("- target: nc pwn.example.com 1337")
    expect(sections.inventory).toContain("- flag format: flag{}")
    expect(sections.routes).toContain("- R1: blocked")
    expect(sections.routes).toContain("name=heap uaf")
    expect(sections.routes).toContain("next=stale pointer into fastbin")
    expect(sections.routes).not.toContain("R2")
    expect(sections.blockedPaths).toContain("R1 heap spray")
    expect(sections.blockedPaths).not.toContain("R2 missing")
  })

  it("keeps general and unqualified board paths while filtering another route", async () => {
    const dir = fixtureDir()
    writeFileSync(
      join(dir, "work", "ctf-evidence", "2610251156", ".ctf-evidence-board.json"),
      JSON.stringify({
        routes: [
          { id: "R2", state: "untested" },
          { id: "general", state: "open" },
        ],
        blockedPaths: ["R2 remote issue", "general shared issue", "unqualified issue"],
      }),
    )

    const sections = await serializeSolveState(dir, { routeId: "R1" })
    expect(sections.routes).toContain("general")
    expect(sections.blockedPaths).toContain("general shared issue")
    expect(sections.blockedPaths).toContain("unqualified issue")
    expect(sections.blockedPaths).not.toContain("R2 remote issue")
  })

  it("marks sections truncated at their independent budgets", async () => {
    const sections = await serializeSolveState(fixtureDir(), {
      budgets: { inventory: 8, routes: 15, blockedPaths: 12 },
    })

    expect(sections.inventory).toContain("truncated")
    expect(sections.routes).toContain("truncated")
    expect(sections.blockedPaths).toContain("truncated")
  })

  it("returns empty board sections when no evidence state exists", async () => {
    const dir = makeTestWorkspace("ctf-ser-empty")
    await expect(serializeSolveState(dir)).resolves.toEqual({ inventory: "", routes: "", blockedPaths: "" })
  })

  it("extracts scalar invariants verbatim and deduplicated", () => {
    const scalars = extractScalars([
      "offset 0x40 and libc 2.31",
      "again 0x40, sha256: aabbccdd1122",
      "connect via 10.0.0.1:9999",
    ])
    expect(scalars).toContain("0x40")
    expect(scalars).toContain("libc 2.31")
    expect(scalars.filter((value) => value === "0x40")).toHaveLength(1)
    expect(scalars.some((value) => value.includes("aabbccdd1122"))).toBe(true)
    expect(scalars).toContain("10.0.0.1:9999")
  })
})
