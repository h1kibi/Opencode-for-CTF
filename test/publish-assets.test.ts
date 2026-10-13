import { describe, expect, it } from "vitest"

// The publish filter is plain ESM so release-check/install can share it without tsx.
// @ts-expect-error The runtime module does not ship TypeScript declarations.
import * as publishAssets from "../scripts/lib/publish-assets.mjs"

const { findForbiddenPackPaths, isPackExcluded, PACK_REQUIRED_PATHS } = publishAssets as {
  findForbiddenPackPaths: (fileList?: string[]) => string[]
  isPackExcluded: (relPosixPath?: string) => boolean
  PACK_REQUIRED_PATHS: string[]
}

describe("publish-assets filters", () => {
  it("excludes the retired local knowledge corpus from the pack surface", () => {
    // ABSENT-BY-DESIGN: `rag/` and `skills-external/` were deleted from the repo
    // (retrieval now lives in the external `ctf_rag` MCP server). The filter is
    // kept so a stale checkout can never smuggle them back into a release.
    expect(isPackExcluded("rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json")).toBe(true)
    expect(isPackExcluded("rag/knowledge/lessons/lessons.index.json")).toBe(true)
    expect(isPackExcluded("rag/Des-CTF-Knowledge/AI-SEARCH-INDEX.md")).toBe(true)
    expect(isPackExcluded("skills-external/secknowledge-skill/SKILL.md")).toBe(true)
    expect(isPackExcluded("package/skills-external/secknowledge-skill/LICENSE")).toBe(true)
  })

  it("keeps the runtime assets inside the pack surface", () => {
    expect(isPackExcluded("dist/plugin/index.js")).toBe(false)
    expect(isPackExcluded("agents/ctf-fast.md")).toBe(false)
    expect(isPackExcluded("skills/ctf-expert/SKILL.md")).toBe(false)
    expect(isPackExcluded("")).toBe(false)
  })

  it("flags forbidden pack paths", () => {
    const offenders = findForbiddenPackPaths([
      // ABSENT-BY-DESIGN: retired corpus entries must be reported as offenders.
      "package/rag/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
      "package/skills-external/secknowledge-skill/SKILL.md",
      "package/mcp-server/vendor/WireMCP/node_modules/axios/index.js",
      "package/mcp-server/vendor/WireMCP/.git/objects/pack/file.pack",
      "package/mcp-server/vendor/WireMCP/package-lock.json",
    ])
    expect(offenders.some((p) => p.includes("rag/knowledge"))).toBe(true)
    expect(offenders.some((p) => p.includes("skills-external"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/node_modules"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/.git"))).toBe(true)
    expect(offenders.some((p) => p.includes("WireMCP/package-lock.json"))).toBe(true)
    expect(PACK_REQUIRED_PATHS).toContain("dist/wiremcp/index.js")
    // ABSENT-BY-DESIGN: no retired corpus path may be a required pack path.
    expect(PACK_REQUIRED_PATHS.some((rel) => rel.startsWith("rag/") || rel.startsWith("skills-external/"))).toBe(false)
  })
})
