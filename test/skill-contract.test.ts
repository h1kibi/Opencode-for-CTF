import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const skillsRoot = join(root, "skills")
const contractHeadings = [
  "Load When",
  "Do Not Load When",
  "Required Inputs",
  "First Safe Action",
  "Dispatch / Handoff",
  "Output Contract",
  "Stop Conditions",
]

function skillNames(): string[] {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function body(name: string): string {
  return readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8")
}

function hasHeading(text: string, heading: string): boolean {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*$`, "m").test(text)
}

describe("skill layer contract", () => {
  it("keeps normalized focused and support skills on the shared contract", () => {
    const normalized = skillNames().filter(
      (value) =>
        value.startsWith("ctf-web-") ||
        value.startsWith("ctf-forensics-") ||
        value.startsWith("ctf-rev-") ||
        [
          "ctf-terminal",
          "ctf-artifact-analysis",
          "ctf-oob-discipline",
          "ctf-whitebox-audit",
          "ctf-seckb",
          "ctf-skill-repo-knowledge",
          "anysearch",
        ].includes(value),
    )
    for (const name of normalized) {
      const text = body(name)
      for (const heading of contractHeadings) {
        expect(hasHeading(text, heading), `${name} missing ## ${heading}`).toBe(true)
      }
    }
  })

  it("keeps every Web focused skill reachable from the Web dispatch table", () => {
    const router = body("ctf-web")
    for (const name of skillNames().filter((value) => value.startsWith("ctf-web-"))) {
      expect(router).toContain(`\`${name}\``)
    }
  })

  it("has no cycle in explicit Load skill edges", () => {
    const names = new Set(skillNames())
    const edges = new Map<string, Set<string>>()
    for (const name of names) {
      const targets = new Set<string>()
      for (const match of body(name).matchAll(/\b[Ll]oad\s+`(ctf-[a-z0-9-]+)`/g)) {
        if (names.has(match[1])) targets.add(match[1])
      }
      edges.set(name, targets)
    }

    const state = new Map<string, "active" | "done">()
    function visit(name: string): void {
      state.set(name, "active")
      for (const target of edges.get(name) ?? []) {
        expect(state.get(target), `${name} -> ${target} creates a Load cycle`).not.toBe("active")
        if (!state.has(target)) visit(target)
      }
      state.set(name, "done")
    }
    for (const name of names) if (!state.has(name)) visit(name)
  })
})
