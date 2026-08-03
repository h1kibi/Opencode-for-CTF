import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (relative: string) => readFileSync(join(root, relative), "utf8")

const families = [
  {
    skill: "skills/ctf-crypto/SKILL.md",
    index: "skills/ctf-crypto/references/REFERENCE_INDEX.md",
    reference: "skills/ctf-crypto/references/lattice-and-zkp.md",
    triggers: ["partial nonces", "lattice-and-zkp.md"],
  },
  {
    skill: "skills/ctf-forensics/SKILL.md",
    index: "skills/ctf-forensics/references/REFERENCE_INDEX.md",
    reference: "skills/ctf-forensics/references/network-advanced.md",
    triggers: ["covert channels", "network-advanced.md"],
  },
  {
    skill: "skills/ctf-misc/SKILL.md",
    index: "skills/ctf-misc/references/REFERENCE_INDEX.md",
    reference: "skills/ctf-misc/references/platform-boundary-triage.md",
    triggers: ["DNS, Linux boundary", "platform-boundary-triage.md"],
  },
  {
    skill: "skills/ctf-rev/SKILL.md",
    index: "skills/ctf-rev/references/REFERENCE_INDEX.md",
    reference: "skills/ctf-rev/references/runtime-platform-triage.md",
    triggers: ["architecture, loader, ABI", "runtime-platform-triage.md"],
  },
] as const

describe("specialist reference coverage", () => {
  it("keeps the new external-inspired references present and routed", () => {
    for (const family of families) {
      expect(existsSync(join(root, family.reference)), family.reference).toBe(true)
      const index = read(family.index)
      const skill = read(family.skill)
      expect(index).toContain(family.reference.split("/").at(-1)!)
      for (const trigger of family.triggers) {
        expect(skill, `${family.skill} missing ${trigger}`).toContain(trigger)
      }
    }
  })

  it("keeps specialist references on the candidate/oracle boundary", () => {
    for (const family of families) {
      const text = read(family.reference)
      expect(text).toContain("untrusted_hint")
      expect(text).toContain("flag_candidate")
      expect(text).toContain("independent")
      expect(text).toContain("agent_flag.txt")
      expect(text).toMatch(/oracle/i)
    }
  })
})
