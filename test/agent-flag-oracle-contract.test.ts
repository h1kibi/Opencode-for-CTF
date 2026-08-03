import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (relative: string) => readFileSync(join(root, relative), "utf8")

const specialistAgents = [
  "ctf-fast",
  "ctf-crypto",
  "ctf-forensics",
  "ctf-misc",
  "ctf-pwn",
  "ctf-rev",
  "ctf-web",
] as const

describe("agent flag oracle contract", () => {
  it("does not let the expert agent promote a pattern match directly", () => {
    const expert = read("agents/ctf-expert.md")
    expect(expert).toContain("a matching string is only a candidate")
    expect(expert).toContain("command=flag-verify")
    expect(expert).toContain("oracle_verified: true")
    expect(expert).toContain("Never promote `flag_detected`, `direct_solve`, or a worker claim by itself")
  })

  it("makes PWN flag_detected explicitly non-final", () => {
    const pwn = read("agents/ctf-pwn.md")
    expect(pwn).toContain("candidate_status: none | pending_oracle | oracle_verified")
    expect(pwn).toContain("flag_detected: true/false (candidate hint only; never final success)")
    expect(pwn).toContain("independent oracle already verified the exact flag")
  })

  it.each(specialistAgents)("requires the shared candidate-to-oracle state machine for %s", (name) => {
    const agent = read(`agents/${name}.md`)
    expect(agent).toContain("untrusted_hint")
    expect(agent).toContain("flag_candidate")
    expect(agent).toContain("oracle_verified")
    expect(agent).toContain("candidate_status: pending_oracle")
    expect(agent).toContain("Only after `oracle_verified: true`")
    expect(agent).toContain("independent")
  })

  it.each(["ctf-crypto", "ctf-forensics", "ctf-rev"])(
    "removes the unsafe immediate candidate reporting path from %s",
    (name) => {
      const agent = read(`agents/${name}.md`)
      expect(agent).not.toContain("Immediate flag reporting rule")
      expect(agent).not.toContain("write the exact flag to agent_flag.txt")
    },
  )

  it("keeps the expert skill aligned with the agent contract", () => {
    const skill = read("skills/ctf-expert/SKILL.md")
    expect(skill).toContain("untrusted_hint -> flag_candidate -> oracle_verified -> closed")
    expect(skill).toContain("candidate_status: pending_oracle")
    expect(skill).toContain("Only after `oracle_verified: true`")
    expect(skill).toContain("exact oracle-verified flag")
  })
})
