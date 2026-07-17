import { describe, expect, it } from "vitest"

// The publish filter is plain ESM so release-check/install can share it without tsx.
// @ts-expect-error The runtime module does not ship TypeScript declarations.
import * as publishAssets from "../scripts/lib/publish-assets.mjs"

const {
  findForbiddenPackPaths,
  isKnowledgeInstallIncluded,
  isPackExcluded,
  PACK_REQUIRED_PATHS,
} = publishAssets as {
  findForbiddenPackPaths: (fileList?: string[]) => string[]
  isKnowledgeInstallIncluded: (rel?: string) => boolean
  isPackExcluded: (relPosixPath?: string) => boolean
  PACK_REQUIRED_PATHS: string[]
}

describe("publish-assets filters", () => {
  it("keeps runtime knowledge indexes and drops intermediate cards", () => {
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.v9.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("pattern-cards/synonyms.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("pwn/README.md")).toBe(true)
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.v8.json")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.json")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/build-ljagiello-cards-v9.cjs")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/curation-candidates.json")).toBe(false)
  })

  it("excludes skills-external and intermediate cards from pack surface", () => {
    expect(isPackExcluded("skills-external/ctf-skills/ctf-web/SKILL.md")).toBe(true)
    expect(isPackExcluded("package/skills-external/ctf-skills/LICENSE")).toBe(true)
    expect(isPackExcluded("knowledge/pattern-cards/ljagiello-ctf-skills.cards.v2.json")).toBe(true)
    expect(isPackExcluded("knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json")).toBe(false)
    expect(isPackExcluded("dist/plugin/index.js")).toBe(false)
  })

  it("flags forbidden pack paths", () => {
    const offenders = findForbiddenPackPaths([
      "package/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
      "package/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v3.json",
      "package/skills-external/ctf-skills/ctf-pwn/SKILL.md",
    ])
    expect(offenders.some((p) => p.includes("cards.v3"))).toBe(true)
    expect(offenders.some((p) => p.includes("skills-external"))).toBe(true)
    expect(PACK_REQUIRED_PATHS).toContain("knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json")
  })
})
