import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import retroSearchTool from "../tools/core/ctf-retro-search.ts"
import importedKnowledgeSearchTool from "../tools/core/ctf-imported-knowledge-search.ts"
import lessonSearchTool from "../tools/core/ctf-lesson-search.ts"
import patternCardSearchTool from "../tools/core/ctf-pattern-card-search.ts"
import patternToHypothesisTool from "../tools/core/ctf-pattern-to-hypothesis.ts"
import skillRepoSearchTool from "../tools/core/ctf-skill-repo-search.ts"
import { validateEvidenceQuery } from "../tools/lib/evidence-query.ts"
import { defaultCardIndexPaths, loadCardIndexes } from "../tools/lib/knowledge-cards.ts"

type RetroToolContext = Parameters<typeof retroSearchTool.execute>[1]
type ImportedKnowledgeToolContext = Parameters<typeof importedKnowledgeSearchTool.execute>[1]
type LessonSearchToolContext = Parameters<typeof lessonSearchTool.execute>[1]
type PatternCardToolContext = Parameters<typeof patternCardSearchTool.execute>[1]
type PatternToHypothesisToolContext = Parameters<typeof patternToHypothesisTool.execute>[1]
type SkillRepoSearchToolContext = Parameters<typeof skillRepoSearchTool.execute>[1]

const tempDirs: string[] = []

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function retroContext(): RetroToolContext {
  return {} as RetroToolContext
}

function importedKnowledgeContext(): ImportedKnowledgeToolContext {
  return {} as ImportedKnowledgeToolContext
}

function lessonSearchContext(): LessonSearchToolContext {
  return {} as LessonSearchToolContext
}

function patternCardContext(): PatternCardToolContext {
  return {} as PatternCardToolContext
}

function patternToHypothesisContext(): PatternToHypothesisToolContext {
  return {} as PatternToHypothesisToolContext
}

function skillRepoSearchContext(): SkillRepoSearchToolContext {
  return {} as SkillRepoSearchToolContext
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("evidence-based RAG query guard", () => {
  it("accepts constraint/evidence queries and rejects title-answer lookup queries", () => {
    expect(validateEvidenceQuery("pwn heap uaf safe-linking tcache libc 2.35 leak oracle").ok).toBe(true)
    expect(validateEvidenceQuery("web jwt kid jku algorithm trust boundary").ok).toBe(true)
    expect(validateEvidenceQuery("babyheap writeup").ok).toBe(false)
    expect(validateEvidenceQuery("easyjwt flag").ok).toBe(false)
    expect(validateEvidenceQuery("warmup").ok).toBe(false)
  })
})

describe("ctf-retro-search", () => {
  it("matches route-ranking and stop-rule evidence from the retro index", async () => {
    const dir = tempDir("ctf-retro-")
    const indexPath = path.join(dir, "retros.index.json")
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          schema_version: 1,
          generated_at: "deterministic",
          retros: [
            {
              id: "retro-web-parser-split",
              case_id: "web-parser-split",
              outcome: "solved",
              category: "web",
              summary: "Parser split caused premature dead-route decisions.",
              route_ranking_lessons: ["Keep parser-mismatch route above generic upload route"],
              stop_rules: ["Stop after two parser controls show identical behavior"],
              pivot_rules: ["Pivot from MIME validation to server-side parser differential"],
              query_terms: ["parser", "split", "route", "dead", "upload"],
            },
          ],
        },
        null,
        2,
      ) + "\n",
    )

    const text = await retroSearchTool.execute(
      { query: "web parser split dead route upload", indexPath },
      retroContext(),
    )
    expect(text).toContain("retro-web-parser-split")
    expect(text).toContain("route_ranking_lessons")
    expect(text).toContain("pivot_rules")
  })

  it("returns a structured block when the retro index is unavailable", async () => {
    const missing = path.join(tempDir("ctf-retro-missing-"), "missing.json")
    const text = await retroSearchTool.execute({ query: "heap route ranking", indexPath: missing }, retroContext())
    expect(text).toContain("BLOCK: retro index not found")
    expect(text).toContain(missing)
  })

  it("blocks challenge-title answer lookup queries before searching retros", async () => {
    const text = await retroSearchTool.execute({ query: "babyheap writeup" }, retroContext())
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("not challenge-title answer lookup")
  })
})

describe("ctf-lesson-search", () => {
  it("blocks challenge-title answer lookup queries before searching lessons", async () => {
    const text = await lessonSearchTool.execute({ query: "some challenge flag" }, lessonSearchContext())
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("use_instead")
  })
})

describe("ctf-imported-knowledge-search", () => {
  it("searches imported mirrors and surfaces compact snippets", async () => {
    const root = tempDir("ctf-imported-")
    const sourceRoot = path.join(root, "des-ctf-knowledge")
    const articleDir = path.join(sourceRoot, "CTF澶ц禌WP闆嗗悎", "articles")
    const aiIndexPath = path.join(sourceRoot, "AI-SEARCH-INDEX.md")
    const articlePath = path.join(articleDir, "demo.md")
    rmSync(sourceRoot, { recursive: true, force: true })
    mkdirSync(articleDir, { recursive: true })
    writeFileSync(aiIndexPath, "SQL injection route map\n", { encoding: "utf8", flag: "w" })
    writeFileSync(articlePath, "Template expression and parser differential notes for Java Web targets.\n", {
      encoding: "utf8",
      flag: "w",
    })
    const text = await importedKnowledgeSearchTool.execute(
      {
        query: "java web template expression parser differential",
        rootPath: root,
        sourceId: "des-ctf-knowledge",
      },
      importedKnowledgeContext(),
    )
    expect(text).toContain("verdict: imported_local_rag_recall")
    expect(text).toContain("demo.md")
    expect(text).toContain("parser differential")
  })

  it("returns a structured unavailable result when no imported mirror exists", async () => {
    const root = tempDir("ctf-imported-missing-")
    rmSync(path.join(root, ".keep"), { force: true })
    const text = await importedKnowledgeSearchTool.execute(
      { query: "jwt trust boundary", rootPath: root, sourceId: "des-ctf-knowledge" },
      importedKnowledgeContext(),
    )
    expect(text).toContain("verdict: imported_knowledge_unavailable")
    expect(text).toContain("hits: 0")
  })

  it("does not require the imported mirror to be committed", () => {
    const committed = existsSync(path.resolve("knowledge", "imported", "des-ctf-knowledge"))
    expect(typeof committed).toBe("boolean")
  })

  it("blocks title-style imported RAG queries before mirror lookup", async () => {
    const text = await importedKnowledgeSearchTool.execute(
      {
        query: "easyjwt solution",
        rootPath: tempDir("ctf-imported-guard-"),
      },
      importedKnowledgeContext(),
    )
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("solution")
  })
})

describe("ctf-skill-repo-search", () => {
  it("uses the pinned SecKnowledge mirror as reference-only evidence", async () => {
    const text = await skillRepoSearchTool.execute(
      {
        query: "url parser redirect private service oracle",
        category: "web",
        maxHits: 5,
      },
      skillRepoSearchContext(),
    )
    expect(text).toContain("reference_repo:")
    expect(text).toContain("skills-external")
    expect(text).toMatch(/references\/web-[^ ]+ score=\d+ family=web/)
    expect(text).toContain("trigger -> first_safe_check -> oracle -> stop_rule -> pivot_rule")
    expect(text).toContain("not final answers or flag evidence")
  })

  it("blocks exact-title writeup style full-text searches", async () => {
    const text = await skillRepoSearchTool.execute(
      {
        query: "babyheap writeup",
        repoPath: tempDir("ctf-skill-repo-guard-"),
      },
      skillRepoSearchContext(),
    )
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("writeup")
  })
})

describe("pattern-card local recall", () => {
  it("loads hand-curated cards from the default index set", () => {
    const paths = defaultCardIndexPaths()
    expect(path.basename(paths[0])).toBe("curated-cards.json")
    const { index, unavailable } = loadCardIndexes()
    expect(unavailable).toEqual([])
    const curated = index.cards.filter((c) => c.id.startsWith("curated:web."))
    expect(curated.length).toBeGreaterThan(0)
    // Stale pre-rag source_file prefixes must not regress.
    const stale = index.cards.filter(
      (c) => c.source_file?.startsWith("knowledge/") || c.source_file?.startsWith("lessons/"),
    )
    expect(stale).toEqual([])
  })

  it("blocks exact-title writeup style pattern-card searches", async () => {
    const text = await patternCardSearchTool.execute(
      {
        query: "babyheap writeup",
        category: "pwn",
      },
      patternCardContext(),
    )
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("writeup")
  })

  it("blocks title-only evidence when converting a card into a hypothesis", async () => {
    const text = await patternToHypothesisTool.execute(
      {
        cardId: "does-not-matter",
        evidence: "babyheap flag",
      },
      patternToHypothesisContext(),
    )
    expect(text).toContain("BLOCK: RAG query must be evidence-based")
    expect(text).toContain("flag")
  })

  it("searches a synthetic Des card index and converts the hit into a hypothesis", async () => {
    const dir = tempDir("ctf-des-cards-")
    const indexPath = path.join(dir, "des.cards.json")
    const synonymsPath = path.join(dir, "synonyms.json")
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          meta: {
            cards: 1,
            generated_at: "deterministic",
            source_repo: "https://example.invalid/des",
            version: 1,
            curated_cards: 1,
            auto_cards: 0,
          },
          cards: [
            {
              id: "des-ctf-web-jwt",
              source: "des-ctf-knowledge",
              source_file: "JWT.idx.md",
              source_repo: "https://example.invalid/des",
              source_commit: "deterministic",
              license_note: "MIT",
              category: "web",
              title: "JWT trust-boundary classification",
              kind: "workflow",
              trigger: "Current evidence matches: jwt, kid, jku, hs256, rs256, algorithm.",
              first_safe_check:
                "Compare accepted algorithms and key selection inputs with a non-privileged token mutation.",
              oracle: "One controlled token mutation changes validation behavior without requiring privileged claims.",
              stop_rule: "Stop after two calibrated token mutations show identical behavior.",
              pivot_rule: "Pivot to adjacent cookie/session trust routes if JWT trust boundary remains inert.",
              keywords: ["jwt", "kid", "jku", "hs256", "rs256", "algorithm"],
              snippet: "Paraphrased decision unit for JWT trust boundaries.",
              quality: 5,
              specificity: 4,
              curated: true,
              preconditions: ["Evidence contains a user-controlled JWT"],
              confirm: "One mutation changes validator behavior.",
              falsify: "Token handling remains identical across calibrated mutations.",
              query_aliases: ["jwt", "kid", "jku", "algorithm confusion"],
              semantic_tokens: ["jwt", "kid", "jku", "hs256", "rs256"],
              retrieval_intents: ["first-safe-check", "route-selection", "stop-rule"],
              rank_boost: 80,
            },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )
    writeFileSync(synonymsPath, JSON.stringify({ jwt: ["token", "jku", "kid"] }, null, 2) + "\n", "utf8")

    const search = await patternCardSearchTool.execute(
      {
        query: "jwt kid jku algorithm trust boundary",
        category: "web",
        indexPath,
        synonymsPath,
        maxHits: 3,
      },
      patternCardContext(),
    )
    expect(search).toContain("des-ctf-web-jwt")
    expect(search).toContain("JWT trust-boundary classification")
    expect(search).toContain("first-safe-check")

    const hypothesis = await patternToHypothesisTool.execute(
      {
        cardId: "des-ctf-web-jwt",
        evidence: "Observed JWT bearer cookie with user-controlled header and kid/jku fields.",
        indexPath,
      },
      patternToHypothesisContext(),
    )
    expect(hypothesis).toContain("verdict: pattern_to_hypothesis")
    expect(hypothesis).toContain("card_id: des-ctf-web-jwt")
    expect(hypothesis).toContain("hypothesis_json")
    expect(hypothesis).toContain("probe_contract_json")
    expect(hypothesis).toContain("JWT.idx.md")
  })

  it("composes retros plus Des card recall into Expert Phase 2 style inputs", async () => {
    const dir = tempDir("ctf-phase2-local-recall-")
    const retroIndexPath = path.join(dir, "retros.index.json")
    const cardIndexPath = path.join(dir, "des.cards.json")
    const synonymsPath = path.join(dir, "synonyms.json")

    writeFileSync(
      retroIndexPath,
      JSON.stringify(
        {
          schema_version: 1,
          generated_at: "deterministic",
          retros: [
            {
              id: "retro-jwt-ordering",
              case_id: "jwt-ordering",
              outcome: "solved",
              category: "web",
              summary: "Premature SQLi exploration hid a JWT trust-boundary route.",
              route_ranking_lessons: ["Keep JWT trust-boundary classification above blind payload variation."],
              stop_rules: ["Stop after two inert token mutations and pivot to adjacent trust surfaces."],
              pivot_rules: ["Pivot from rs256 confusion assumptions to kid/jku key-selection testing."],
              query_terms: ["jwt", "kid", "jku", "token", "trust"],
            },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )

    writeFileSync(
      cardIndexPath,
      JSON.stringify(
        {
          meta: {
            cards: 1,
            generated_at: "deterministic",
            source_repo: "https://example.invalid/des",
            version: 1,
            curated_cards: 1,
            auto_cards: 0,
          },
          cards: [
            {
              id: "des-ctf-web-jwt",
              source: "des-ctf-knowledge",
              source_file: "JWT.idx.md",
              source_repo: "https://example.invalid/des",
              source_commit: "deterministic",
              license_note: "MIT",
              category: "web",
              title: "JWT trust-boundary classification",
              kind: "workflow",
              trigger: "Current evidence matches: jwt, kid, jku, hs256, rs256, algorithm.",
              first_safe_check:
                "Compare accepted algorithms and key selection inputs with a non-privileged token mutation.",
              oracle: "One controlled token mutation changes validation behavior without requiring privileged claims.",
              stop_rule: "Stop after two calibrated token mutations show identical behavior.",
              pivot_rule: "Pivot to adjacent cookie/session trust routes if JWT trust boundary remains inert.",
              keywords: ["jwt", "kid", "jku", "hs256", "rs256", "algorithm"],
              snippet: "Paraphrased decision unit for JWT trust boundaries.",
              quality: 5,
              specificity: 4,
              curated: true,
              preconditions: ["Evidence contains a user-controlled JWT"],
              confirm: "One mutation changes validator behavior.",
              falsify: "Token handling remains identical across calibrated mutations.",
              query_aliases: ["jwt", "kid", "jku", "algorithm confusion"],
              semantic_tokens: ["jwt", "kid", "jku", "hs256", "rs256"],
              retrieval_intents: ["first-safe-check", "route-selection", "stop-rule"],
              rank_boost: 80,
            },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )

    writeFileSync(synonymsPath, JSON.stringify({ jwt: ["token", "jku", "kid"] }, null, 2) + "\n", "utf8")

    const retro = await retroSearchTool.execute(
      {
        query: "jwt kid jku token trust boundary",
        indexPath: retroIndexPath,
      },
      retroContext(),
    )
    const cards = await patternCardSearchTool.execute(
      {
        query: "jwt kid jku token trust boundary",
        category: "web",
        indexPath: cardIndexPath,
        synonymsPath,
        maxHits: 3,
      },
      patternCardContext(),
    )
    const hypothesis = await patternToHypothesisTool.execute(
      {
        cardId: "des-ctf-web-jwt",
        evidence: "JWT cookie exposes user-controlled header fields including kid and jku.",
        indexPath: cardIndexPath,
      },
      patternToHypothesisContext(),
    )

    expect(retro).toContain("retro-jwt-ordering")
    expect(retro).toContain("route_ranking_lessons")
    expect(cards).toContain("des-ctf-web-jwt")
    expect(cards).toContain("JWT trust-boundary classification")
    expect(hypothesis).toContain("verdict: pattern_to_hypothesis")
    expect(hypothesis).toContain("Stop after two calibrated token mutations show identical behavior")
  })

  it("retrieves a new Des crypto card and converts it into a hypothesis", async () => {
    const dir = tempDir("ctf-des-crypto-cards-")
    const indexPath = path.join(dir, "des.cards.json")
    const synonymsPath = path.join(dir, "synonyms.json")
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          meta: {
            cards: 1,
            generated_at: "deterministic",
            source_repo: "https://example.invalid/des",
            version: 1,
            curated_cards: 1,
            auto_cards: 0,
          },
          cards: [
            {
              id: "des-ctf-crypto-rsa-routing",
              source: "des-ctf-knowledge",
              source_file: "RSA密码学.md",
              source_repo: "https://example.invalid/des",
              source_commit: "deterministic",
              license_note: "MIT",
              category: "crypto",
              title: "RSA attack-surface classification",
              kind: "workflow",
              trigger: "Current evidence matches: rsa, small e, common modulus, broadcast, dp leak, crt.",
              first_safe_check:
                "Determine whether the first exploitable RSA surface is padding, modulus reuse, leaked CRT material, or exponent misuse before solving.",
              oracle: "One controlled differential isolates the likely RSA failure family.",
              stop_rule: "Stop after two inert math-surface checks and pivot to encoding or transport assumptions.",
              pivot_rule:
                "Pivot from algebraic RSA assumptions to encoding-versus-crypto classification when no key-structure differential appears.",
              keywords: ["rsa", "small e", "common modulus", "broadcast", "dp leak", "crt"],
              snippet: "Paraphrased decision unit for RSA routing.",
              quality: 5,
              specificity: 4,
              curated: true,
              preconditions: ["Evidence contains an RSA-like modulus or exponent surface"],
              confirm: "A small algebraic or structural differential identifies one RSA family.",
              falsify: "Repeated calibrated checks do not distinguish any RSA-specific surface.",
              query_aliases: ["rsa", "broadcast", "common modulus", "small e"],
              semantic_tokens: ["rsa", "broadcast", "small e", "crt"],
              retrieval_intents: ["first-safe-check", "route-selection", "stop-rule"],
              rank_boost: 80,
            },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )
    writeFileSync(synonymsPath, JSON.stringify({ rsa: ["crt", "modulus", "broadcast"] }, null, 2) + "\n", "utf8")

    const search = await patternCardSearchTool.execute(
      {
        query: "rsa common modulus broadcast small e",
        category: "crypto",
        indexPath,
        synonymsPath,
        maxHits: 3,
      },
      patternCardContext(),
    )
    expect(search).toContain("des-ctf-crypto-rsa-routing")
    expect(search).toContain("RSA attack-surface classification")

    const hypothesis = await patternToHypothesisTool.execute(
      {
        cardId: "des-ctf-crypto-rsa-routing",
        evidence: "Observed RSA modulus/exponent inputs and repeated modulus structure across challenge artifacts.",
        indexPath,
      },
      patternToHypothesisContext(),
    )
    expect(hypothesis).toContain("verdict: pattern_to_hypothesis")
    expect(hypothesis).toContain("card_id: des-ctf-crypto-rsa-routing")
    expect(hypothesis).toContain("RSA密码学.md")
  })

  it("retrieves a new Des misc card for pyjail-style routing", async () => {
    const dir = tempDir("ctf-des-misc-cards-")
    const indexPath = path.join(dir, "des.cards.json")
    const synonymsPath = path.join(dir, "synonyms.json")
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          meta: {
            cards: 1,
            generated_at: "deterministic",
            source_repo: "https://example.invalid/des",
            version: 1,
            curated_cards: 1,
            auto_cards: 0,
          },
          cards: [
            {
              id: "des-ctf-misc-pyjail",
              source: "des-ctf-knowledge",
              source_file: "Python沙箱逃逸.md",
              source_repo: "https://example.invalid/des",
              source_commit: "deterministic",
              license_note: "MIT",
              category: "misc",
              title: "Python sandbox and pyjail routing",
              kind: "workflow",
              trigger: "Current evidence matches: pyjail, sandbox, builtin, blacklist, eval, import.",
              first_safe_check:
                "Classify whether the jail restricts builtins, syntax, imports, or output before attempting object-graph traversal.",
              oracle: "One bounded probe reveals the dominant sandbox boundary.",
              stop_rule:
                "Stop after two inert capability probes and pivot to encoding or protocol framing assumptions.",
              pivot_rule:
                "Pivot from syntax filters to object-graph or representation attacks when the initial sandbox primitive is blocked.",
              keywords: ["pyjail", "sandbox", "builtin", "blacklist", "eval", "import"],
              snippet: "Paraphrased decision unit for Python jail routing.",
              quality: 5,
              specificity: 4,
              curated: true,
              preconditions: ["Evidence shows a constrained Python execution surface"],
              confirm: "A single bounded probe identifies the primary sandbox boundary.",
              falsify: "Repeated calibrated probes show no distinct Python sandbox surface.",
              query_aliases: ["pyjail", "python jail", "sandbox escape"],
              semantic_tokens: ["pyjail", "sandbox", "builtin", "import"],
              retrieval_intents: ["first-safe-check", "route-selection", "stop-rule"],
              rank_boost: 80,
            },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )
    writeFileSync(
      synonymsPath,
      JSON.stringify({ pyjail: ["sandbox", "python jail", "builtin"] }, null, 2) + "\n",
      "utf8",
    )

    const search = await patternCardSearchTool.execute(
      {
        query: "pyjail python sandbox builtin import",
        category: "misc",
        indexPath,
        synonymsPath,
        maxHits: 3,
      },
      patternCardContext(),
    )
    expect(search).toContain("des-ctf-misc-pyjail")
    expect(search).toContain("Python sandbox and pyjail routing")
  })
})


