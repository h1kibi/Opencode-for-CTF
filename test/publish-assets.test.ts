import { describe, expect, it } from "vitest"

// The publish filter is plain ESM so release-check/install can share it without tsx.
// @ts-expect-error The runtime module does not ship TypeScript declarations.
import * as publishAssets from "../scripts/lib/publish-assets.mjs"

const { findForbiddenPackPaths, isKnowledgeInstallIncluded, isPackExcluded, PACK_REQUIRED_PATHS } = publishAssets as {
  findForbiddenPackPaths: (fileList?: string[]) => string[]
  isKnowledgeInstallIncluded: (rel?: string) => boolean
  isPackExcluded: (relPosixPath?: string) => boolean
  PACK_REQUIRED_PATHS: string[]
}

describe("publish-assets filters", () => {
  it("keeps runtime knowledge indexes and drops intermediate cards", () => {
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.v9.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("pattern-cards/synonyms.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("pattern-cards/des-ctf/des-ctf.cards.v1.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("retros/retros.index.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("sources/des-ctf-knowledge.manifest.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("sources/secknowledge-skill.manifest.json")).toBe(true)
    expect(isKnowledgeInstallIncluded("pwn/README.md")).toBe(true)
    expect(isKnowledgeInstallIncluded("imported/des-ctf-knowledge/AI-SEARCH-INDEX.md")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.v8.json")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/ljagiello-ctf-skills.cards.json")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/build-ljagiello-cards-v9.cjs")).toBe(false)
    expect(isKnowledgeInstallIncluded("pattern-cards/curation-candidates.json")).toBe(false)
  })

  it("excludes skills-external and intermediate cards from pack surface", () => {
    expect(isPackExcluded("skills-external/secknowledge-skill/SKILL.md")).toBe(true)
    expect(isPackExcluded("package/skills-external/secknowledge-skill/LICENSE")).toBe(true)
    expect(isPackExcluded("rag/Des-CTF-Knowledge/AI-SEARCH-INDEX.md")).toBe(true)
    expect(isPackExcluded("rag/knowledge/imported/des-ctf-knowledge/AI-SEARCH-INDEX.md")).toBe(true)
    expect(isPackExcluded("rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v2.json")).toBe(true)
    expect(isPackExcluded("rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json")).toBe(false)
    expect(isPackExcluded("dist/plugin/index.js")).toBe(false)
  })

  it("flags forbidden pack paths", () => {
    const offenders = findForbiddenPackPaths([
      "package/rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
      "package/rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v3.json",
      "package/rag/Des-CTF-Knowledge/AI-SEARCH-INDEX.md",
      "package/skills-external/secknowledge-skill/SKILL.md",
      "package/mcp-server/vendor/WireMCP/node_modules/axios/index.js",
      "package/mcp-server/vendor/WireMCP/.git/objects/pack/file.pack",
      "package/mcp-server/vendor/WireMCP/package-lock.json",
    ])
    expect(offenders.some((p) => p.includes("cards.v3"))).toBe(true)
    expect(offenders.some((p) => p.includes("skills-external"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/node_modules"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/.git"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/package-lock.json"))).toBe(true)
    expect(offenders.some((p) => p.includes("rag/Des-CTF-Knowledge"))).toBe(true)
    expect(PACK_REQUIRED_PATHS).toContain("dist/wiremcp/index.js")
    expect(PACK_REQUIRED_PATHS).toContain("rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json")
    expect(PACK_REQUIRED_PATHS).toContain("rag/knowledge/pattern-cards/des-ctf/des-ctf.cards.v1.json")
    expect(PACK_REQUIRED_PATHS).toContain("rag/knowledge/retros/retros.index.json")
    expect(PACK_REQUIRED_PATHS).toContain("rag/knowledge/sources/secknowledge-skill.manifest.json")
  })
})
