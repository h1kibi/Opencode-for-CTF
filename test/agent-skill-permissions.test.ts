import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function agentText(agent: string): string {
  return readFileSync(join(root, "agents", `${agent}.md`), "utf8")
}

function skillPermissions(agent: string): Map<string, string> {
  const text = agentText(agent)
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
  const lines = frontmatter.split(/\r?\n/)
  const permissions = new Map<string, string>()
  let inPermission = false
  let inSkill = false

  for (const line of lines) {
    if (/^"permission":/.test(line)) {
      inPermission = true
      continue
    }
    if (inPermission && /^"[^"]+":/.test(line)) break
    if (inPermission && /^  "skill":/.test(line)) {
      inSkill = true
      continue
    }
    if (!inSkill) continue
    if (/^  "[^"]+":/.test(line) && !/^    /.test(line)) break

    const match = line.match(/^\s+"([^"]+)":\s+"([^"]+)"/)
    if (match) permissions.set(match[1], match[2])
  }

  return permissions
}

describe("agent skill permissions", () => {
  it("keeps ctf-fast off family skills", () => {
    const permissions = skillPermissions("ctf-fast")

    expect(permissions.get("*")).toBe("deny")
    expect(permissions.get("ctf-common")).toBe("allow")
    expect(permissions.get("ctf-terminal")).toBe("allow")
    expect(permissions.get("ctf-router")).toBe("allow")
    expect(permissions.get("ctf-web")).toBeUndefined()
    expect(permissions.get("ctf-pwn")).toBeUndefined()
    expect(permissions.get("ctf-rev")).toBeUndefined()
    expect(permissions.get("ctf-crypto")).toBeUndefined()
    expect(permissions.get("ctf-forensics")).toBeUndefined()
    expect(permissions.get("ctf-misc")).toBeUndefined()
    expect(permissions.get("ctf-closure-gate")).toBeUndefined()
    expect(permissions.get("ctf-*")).toBeUndefined()
  })

  it("allows ctf-expert to use the full CTF skill surface", () => {
    const permissions = skillPermissions("ctf-expert")

    expect(permissions.get("*")).toBe("deny")
    expect(permissions.get("ctf-*")).toBe("allow")
  })

  it("equips category subagents with their family skill", () => {
    const required: Record<string, string[]> = {
      "ctf-web": ["ctf-web", "ctf-web-*", "ctf-closure-gate"],
      "ctf-pwn": ["ctf-pwn", "ctf-closure-gate"],
      "ctf-rev": ["ctf-rev", "ctf-closure-gate"],
      "ctf-crypto": ["ctf-crypto", "ctf-closure-gate"],
      "ctf-forensics": ["ctf-forensics", "ctf-forensics-*", "ctf-closure-gate"],
      "ctf-misc": ["ctf-misc", "ctf-closure-gate"],
      "ctf-aisec": ["ctf-aisec", "ctf-misc-ai-ml", "ctf-closure-gate"],
    }

    for (const [agent, skillNames] of Object.entries(required)) {
      const permissions = skillPermissions(agent)
      expect(permissions.get("*"), agent).toBe("deny")
      expect(permissions.get("ctf-ledger-discipline"), `${agent} missing shared ledger discipline`).toBe("allow")
      for (const skillName of skillNames) {
        expect(permissions.get(skillName), `${agent} missing ${skillName}`).toBe("allow")
      }
    }
  })
})
