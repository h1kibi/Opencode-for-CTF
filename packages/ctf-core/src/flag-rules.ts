/**
 * Canonical default flag-identification rules shared by tools, agents, and
 * benchmark extraction. Keep format detection separate from proof verification:
 * a high-confidence shape is useful evidence, but an independent oracle is
 * still required before claiming exact challenge success.
 */

export type FlagConfidence = "high" | "medium"
export type FlagCandidateKind = "braced" | "uuid" | "bare-md5" | "bare-sha256" | "custom"

export type FlagEvidenceContext = {
  /** Human-readable source, e.g. a file path, command label, or response name. */
  source?: string
  /** Optional nearby text containing the candidate. */
  text?: string
  /** Optional origin label such as file, solver-output, http-response, or terminal. */
  origin?: string
}

export type FlagCandidate = {
  value: string
  confidence: FlagConfidence
  kind: FlagCandidateKind
  reason: string
  source?: string
}

/** Default high-confidence braced flag: prefix{10..60 safe payload chars}. */
export const HIGH_CONFIDENCE_FLAG_PATTERN = "[A-Za-z0-9]{3,10}\\{[A-Za-z0-9_@!\\-]{10,60}\\}"

/** Explicit UUID-shaped flag variant; included for documentation and tests. */
export const UUID_FLAG_PATTERN =
  "(?:flag|ctf)\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\}"

/** Bare hashes are only accepted when the surrounding context identifies a flag source. */
export const BARE_HASH_PATTERN = "(?:[A-Fa-f0-9]{64}|[A-Fa-f0-9]{32})"

export const DEFAULT_FLAG_PATTERN = `(?:${HIGH_CONFIDENCE_FLAG_PATTERN}|${UUID_FLAG_PATTERN})`
export const DEFAULT_FLAG_REGEX = new RegExp(DEFAULT_FLAG_PATTERN, "gi")
export const BARE_HASH_REGEX = new RegExp(`(?<![A-Fa-f0-9])${BARE_HASH_PATTERN}(?![A-Fa-f0-9])`, "gi")

/** Backward-compatible aliases used by existing tool code. */
export const FLAG_PATTERN = HIGH_CONFIDENCE_FLAG_PATTERN
export const FLAG_REGEX = new RegExp(FLAG_PATTERN, "g")
export const FLAG_REGEX_ONCE = new RegExp(FLAG_PATTERN)

const FLAG_SOURCE_RE = /(?:^|[\\/])(?:\.flag|flag(?:\.txt)?|readflag|getflag)(?=$|[\\/:#\s\\])/i
const FLAG_NAME_RE = /(?:^|[\s"'`])(?:\.flag|flag(?:\.txt)?|readflag|getflag)(?=$|[\s"'`:#\\])/i
const FLAG_COMMAND_RE =
  /\b(?:cat|type|Get-Content|more|head|tail|strings|xxd|od|sha256sum|md5sum)\b[^\r\n]{0,100}(?:[\/](?:\.flag|flag(?:\.txt)?)(?=$|[\s"'`:#\\])|(?:\.flag|flag(?:\.txt)?|readflag|getflag)(?=$|[\s"'`:#\\]))/i
const FLAG_HELPER_RE = /\b(?:readflag|getflag)\b/i

function normalizeContext(context?: FlagEvidenceContext | string): FlagEvidenceContext {
  return typeof context === "string" ? { text: context } : (context ?? {})
}

/**
 * Return true only when the source or nearby text explicitly points to a flag
 * file/helper or a command reading one. Generic words like "hash" do not
 * qualify, so ordinary MD5/SHA256 values remain rejected by default.
 */
export function hasFlagSourceContext(context?: FlagEvidenceContext | string): boolean {
  const normalized = normalizeContext(context)
  const source = normalized.source ?? ""
  const text = normalized.text ?? ""
  return (
    FLAG_SOURCE_RE.test(source) || FLAG_NAME_RE.test(source) || FLAG_COMMAND_RE.test(text) || FLAG_HELPER_RE.test(text)
  )
}

function classifyBraced(value: string, source?: string): FlagCandidate | undefined {
  if (new RegExp(`^${HIGH_CONFIDENCE_FLAG_PATTERN}$`, "i").test(value)) {
    const uuid = new RegExp(`^${UUID_FLAG_PATTERN}$`, "i").test(value)
    return {
      value,
      confidence: "high",
      kind: uuid ? "uuid" : "braced",
      reason: uuid ? "UUID-shaped flag with an explicit flag/ctf prefix" : "strict prefix{payload} shape",
      source,
    }
  }
  return undefined
}

/** Classify one candidate under the default rules. Custom formats must use an explicit pattern/oracle. */
export function classifyFlagCandidate(
  value: string,
  context?: FlagEvidenceContext | string,
): FlagCandidate | undefined {
  const normalized = value.trim()
  if (!normalized || /[\r\n]/.test(normalized)) return undefined

  const braced = classifyBraced(normalized, normalizeContext(context).source)
  if (braced) return braced

  if (!hasFlagSourceContext(context)) return undefined

  if (/^[A-Fa-f0-9]{32}$/.test(normalized)) {
    return {
      value: normalized,
      confidence: "medium",
      kind: "bare-md5",
      reason: "bare MD5 was found with explicit flag-file/readflag context",
      source: normalizeContext(context).source,
    }
  }
  if (/^[A-Fa-f0-9]{64}$/.test(normalized)) {
    return {
      value: normalized,
      confidence: "medium",
      kind: "bare-sha256",
      reason: "bare SHA-256 was found with explicit flag-file/readflag context",
      source: normalizeContext(context).source,
    }
  }

  return undefined
}

function nearbyContext(text: string, start: number, end: number): string {
  const radius = 140
  return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius))
}

/** Extract accepted default candidates with confidence and source rationale. */
export function extractFlagCandidates(text: string, context?: FlagEvidenceContext | string): FlagCandidate[] {
  const normalizedContext = normalizeContext(context)
  const candidates: FlagCandidate[] = []
  const seen = new Set<string>()
  const sourceText = text ?? ""

  const collect = (regex: RegExp) => {
    const safe = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`)
    for (const match of sourceText.matchAll(safe)) {
      const value = match[0]?.trim()
      if (!value || seen.has(value)) continue
      const start = match.index ?? 0
      const classified = classifyFlagCandidate(value, {
        ...normalizedContext,
        text: nearbyContext(sourceText, start, start + value.length),
      })
      if (classified) {
        seen.add(value)
        candidates.push(classified)
      }
    }
  }

  collect(DEFAULT_FLAG_REGEX)
  collect(BARE_HASH_REGEX)
  return candidates
}

/** Extract only values, preserving the old helper's first-seen/deduplicated API. */
export function findFlags(text: string, context?: FlagEvidenceContext | string): string[] {
  return extractFlagCandidates(text, context).map((candidate) => candidate.value)
}
