/**
 * Shared publish / install asset filters for opencode-for-ctf.
 *
 * Goals:
 * - npm package ships runtime-needed knowledge only (current pattern-card index)
 * - managed install copies the same slim knowledge surface (source checkout may still have history)
 * - external skills stay opt-in via OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS
 */

import path from "node:path"

/** Normalize to posix-ish relative path for matching. */
export function toPosixRel(input = "") {
  return String(input).replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "")
}

/**
 * Intermediate ljagiello pattern-card dumps and generation helpers.
 * Runtime tools use v9 only (see src/asset-paths.ts).
 */
const INTERMEDIATE_CARD_BASENAMES = new Set([
  "ljagiello-ctf-skills.cards.json",
  "ljagiello-ctf-skills.cards.v2.json",
  "ljagiello-ctf-skills.cards.v3.json",
  "ljagiello-ctf-skills.cards.v4.json",
  "ljagiello-ctf-skills.cards.v5.json",
  "ljagiello-ctf-skills.cards.v6.json",
  "ljagiello-ctf-skills.cards.v7.json",
  "ljagiello-ctf-skills.cards.v8.json",
])

const PATTERN_CARD_DEV_PREFIXES = [
  "knowledge/pattern-cards/build-",
  "knowledge/pattern-cards/smoke-",
  "knowledge/pattern-cards/update-",
]

const PATTERN_CARD_DEV_FILES = new Set([
  "knowledge/pattern-cards/curation-candidates.json",
])

/** Paths that must never appear in the default published tarball. */
const PACK_FORBIDDEN_SUBSTRINGS = [
  "skills-external/",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v2.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v3.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v4.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v5.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v6.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v7.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v8.json",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.json",
]

/** Paths that must exist in a healthy published package (relative to package root). */
export const PACK_REQUIRED_PATHS = [
  "dist/plugin/index.js",
  "knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json",
  "knowledge/pattern-cards/java-web/java-web.cards.v1.json",
  "knowledge/pattern-cards/pwn-curated.cards.v1.json",
  "knowledge/pattern-cards/synonyms.json",
  "agents/ctf-fast.md",
  "agents/ctf-expert.md",
  "commands/ctf.md",
  "scripts/cli.mjs",
]

/**
 * Whether a path under `knowledge/` should be copied during managed install.
 * `rel` is relative to the knowledge directory (not the repo root).
 */
export function isKnowledgeInstallIncluded(rel = "") {
  const posix = toPosixRel(rel)
  if (!posix) return true

  const base = path.posix.basename(posix)
  if (INTERMEDIATE_CARD_BASENAMES.has(base)) return false

  // Dev-only pattern-card generators / smoke harnesses under pattern-cards/
  if (posix.startsWith("pattern-cards/")) {
    const name = base
    if (name.startsWith("build-") && name.endsWith(".cjs")) return false
    if (name.startsWith("smoke-") && name.endsWith(".cjs")) return false
    if (name.startsWith("update-") && (name.endsWith(".ps1") || name.endsWith(".sh"))) return false
    if (name === "curation-candidates.json") return false
  }

  return true
}

/**
 * Whether a repo-relative path should be excluded from the default npm pack surface.
 * Used by release checks against `npm pack --dry-run --json` file lists.
 */
export function isPackExcluded(relPosixPath = "") {
  const posix = toPosixRel(relPosixPath)
  if (!posix) return false

  // npm pack lists usually look like "package/foo" or "foo"
  const normalized = posix.replace(/^package\//, "")

  if (normalized.startsWith("skills-external/")) return true

  if (normalized.startsWith("knowledge/")) {
    const underKnowledge = normalized.slice("knowledge/".length)
    if (!isKnowledgeInstallIncluded(underKnowledge)) return true
  }

  for (const prefix of PATTERN_CARD_DEV_PREFIXES) {
    if (normalized.startsWith(prefix)) return true
  }
  if (PATTERN_CARD_DEV_FILES.has(normalized)) return true

  return false
}

/**
 * Hard-fail pack content checks (forbidden artifacts that must not ship).
 * Returns list of offending paths (empty if clean).
 */
export function findForbiddenPackPaths(fileList = []) {
  const offenders = []
  for (const entry of fileList) {
    const posix = toPosixRel(entry).replace(/^package\//, "")
    for (const bad of PACK_FORBIDDEN_SUBSTRINGS) {
      if (posix.includes(bad) || posix === bad.replace(/\/$/, "")) {
        offenders.push(posix)
        break
      }
    }
    // Also catch intermediate cards by basename anywhere under knowledge/
    const base = path.posix.basename(posix)
    if (posix.startsWith("knowledge/") && INTERMEDIATE_CARD_BASENAMES.has(base)) {
      if (!offenders.includes(posix)) offenders.push(posix)
    }
  }
  return offenders
}

/**
 * Soft size thresholds for pack dry-run reporting (bytes).
 * Unpacked still includes v9 (~27MB); adjust when Phase B slim lands.
 */
export const PACK_SIZE_WARN = {
  compressedBytes: 8 * 1024 * 1024,
  unpackedBytes: 45 * 1024 * 1024,
}
