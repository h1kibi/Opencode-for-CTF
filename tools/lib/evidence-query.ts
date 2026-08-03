export type EvidenceQueryCheck = {
  ok: boolean
  reason?: string
  evidenceTerms: string[]
  blockedTerms: string[]
}

const TITLE_OR_ANSWER_INTENT = new Set([
  "answer",
  "ctftime",
  "flag",
  "github",
  "solution",
  "solve",
  "solver",
  "walkthrough",
  "wp",
  "writeup",
  "答案",
  "题解",
])

const TITLE_FILLER = new Set([
  "baby",
  "beginner",
  "chall",
  "challenge",
  "ctf",
  "easy",
  "final",
  "forensics",
  "hard",
  "intro",
  "level",
  "medium",
  "misc",
  "part",
  "pwn",
  "re",
  "rev",
  "reverse",
  "warmup",
  "web",
])

export function evidenceQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}_+.#:-]+/u)
        .filter((term) => term.length >= 2),
    ),
  )
}

export function validateEvidenceQuery(query: string, minEvidenceTerms = 2): EvidenceQueryCheck {
  const terms = evidenceQueryTerms(query)
  const blockedTerms = terms.filter((term) => TITLE_OR_ANSWER_INTENT.has(term))
  if (blockedTerms.length) {
    return {
      ok: false,
      reason: `query asks for answer/title lookup terms: ${blockedTerms.join(", ")}`,
      evidenceTerms: [],
      blockedTerms,
    }
  }

  const evidenceTerms = terms.filter((term) => !TITLE_FILLER.has(term))
  if (evidenceTerms.length < minEvidenceTerms) {
    return {
      ok: false,
      reason: `query has ${evidenceTerms.length} evidence terms; need at least ${minEvidenceTerms}`,
      evidenceTerms,
      blockedTerms,
    }
  }

  return { ok: true, evidenceTerms, blockedTerms }
}

export function formatEvidenceQueryBlock(query: string, check: EvidenceQueryCheck): string {
  return [
    "BLOCK: RAG query must be evidence-based, not challenge-title answer lookup",
    `query: ${query}`,
    `reason: ${check.reason ?? "insufficient evidence terms"}`,
    `evidence_terms: ${check.evidenceTerms.join(" | ") || "none"}`,
    "use_instead: category + observed primitive + boundary/oracle + constraint terms",
    "examples:",
    "- pwn heap uaf safe-linking tcache libc 2.35 leak oracle",
    "- web jwt kid jku algorithm trust boundary",
    "- reverse custom vm opcode dispatcher xor table success string",
  ].join("\n")
}
