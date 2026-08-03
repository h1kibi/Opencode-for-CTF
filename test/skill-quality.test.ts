import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const skillsRoot = join(root, "skills")

function skillDirs(): string[] {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "")
}

function markdownNames(rootDir: string): Set<string> {
  return new Set(
    readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.replace(/\.md$/, "")),
  )
}

function toolNames(rootDir: string): Set<string> {
  const names = new Set<string>()
  const stack = [rootDir]

  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (/\.(ts|js)$/.test(entry.name)) names.add(entry.name.replace(/\.(ts|js)$/, ""))
    }
  }

  return names
}

describe("skill quality", () => {
  it("keeps every bundled skill discoverable with standard frontmatter", () => {
    for (const skillName of skillDirs()) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      expect(existsSync(skillPath), `${skillName} missing SKILL.md`).toBe(true)

      const text = readFileSync(skillPath, "utf8")
      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
      const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ""
      const compatibility = frontmatter.match(/^compatibility:\s*(.+)$/m)?.[1]?.trim()

      expect(name, `${skillName} frontmatter name`).toBe(skillName)
      expect(description, `${skillName} frontmatter description`).toBeTruthy()
      expect(description, `${skillName} description should be trigger-oriented`).toMatch(/^Use\b/i)
      expect(description.length, `${skillName} description length`).toBeLessThanOrEqual(280)
      expect(compatibility, `${skillName} compatibility`).toBe("opencode")
    }
  })

  it("avoids duplicate markdown section headings in skill bodies", () => {
    for (const skillName of skillDirs()) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const text = stripFencedCode(readFileSync(skillPath, "utf8"))
      const seen = new Map<string, number[]>()

      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (!/^#{2,4}\s+/.test(line)) continue
        const heading = line.trim()
        const lines = seen.get(heading) ?? []
        lines.push(index + 1)
        seen.set(heading, lines)
      }

      for (const [heading, lines] of seen.entries()) {
        expect(lines, `${skillName} duplicate heading ${heading}`).toHaveLength(1)
      }
    }
  })

  it("keeps skill bodies within the progressive disclosure size budget", () => {
    for (const skillName of skillDirs()) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const lineCount = readFileSync(skillPath, "utf8").split(/\r?\n/).length

      expect(lineCount, `${skillName} SKILL.md line count`).toBeLessThanOrEqual(500)
    }
  })

  it("keeps Load references limited to real bundled skills", () => {
    const bundledSkills = new Set(skillDirs())

    for (const skillName of bundledSkills) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const text = readFileSync(skillPath, "utf8")

      for (const match of text.matchAll(/\bLoad `([^`]+)`/g)) {
        const ref = match[1]
        if (!/^ctf-[a-z0-9-]+$/.test(ref)) continue
        expect(bundledSkills.has(ref), `${skillName} loads missing skill ${ref}`).toBe(true)
      }
    }
  })

  it("does not point explicit skills/ markdown paths at missing files", () => {
    const bundledSkills = new Set(skillDirs())

    for (const skillName of bundledSkills) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const text = readFileSync(skillPath, "utf8")

      for (const match of text.matchAll(/skills\/(ctf-[^/`\s)]+)(?:\/([^`\s)]+))?/g)) {
        const referencedSkill = match[1]
        const relativePath = match[2]

        expect(bundledSkills.has(referencedSkill), `${skillName} references missing skill ${referencedSkill}`).toBe(
          true,
        )
        if (!relativePath || relativePath.includes("*") || relativePath.includes("<")) continue
        expect(
          existsSync(join(skillsRoot, referencedSkill, relativePath)),
          `${skillName} references missing path ${match[0]}`,
        ).toBe(true)
      }
    }
  })

  it("does not point explicit relative markdown references at missing files", () => {
    for (const skillName of skillDirs()) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const text = readFileSync(skillPath, "utf8")

      for (const match of text.matchAll(/`((?:references|\.{1,2}\/)[^`]+\.md)`/g)) {
        const ref = match[1]
        if (ref.includes("*") || ref.includes("<")) continue

        expect(existsSync(resolve(dirname(skillPath), ref)), `${skillName} missing ${ref}`).toBe(true)
      }
    }
  })

  it("keeps inline ctf-* identifiers resolvable to a bundled object", () => {
    const knownNames = new Set([
      ...skillDirs(),
      ...markdownNames(join(root, "agents")),
      ...markdownNames(join(root, "commands")),
      ...toolNames(join(root, "tools")),
      "ctf-team-dispatch",
      "ctf-team-status",
      "ctf-team-collect",
      "ctf-team-cancel",
      "ctf-team-cancel-route",
      "ctf-team-close",
      "ctf-team-recover",
  "ctf-team-adopt",
    ])

    for (const skillName of skillDirs()) {
      const skillPath = join(skillsRoot, skillName, "SKILL.md")
      const text = readFileSync(skillPath, "utf8")

      for (const match of text.matchAll(/`(ctf-[a-z0-9-]+)`/g)) {
        const identifier = match[1]
        expect(knownNames.has(identifier), `${skillName} references unknown ${identifier}`).toBe(true)
      }
    }
  })
})
