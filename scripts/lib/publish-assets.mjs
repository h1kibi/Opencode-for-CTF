/**
 * Shared publish / install asset filters for opencode-for-ctf.
 *
 * Goals:
 * - the npm package ships runtime code plus the model-facing assets (agents,
 *   commands, skills, rules, templates, mcp-server)
 * - local knowledge retrieval is NOT bundled: it is served by the external
 *   `ctf_rag` MCP server, so no corpus, card index, or lesson/retro store ships
 * - external skills stay opt-in via OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS
 */

/** Normalize to posix-ish relative path for matching. */
export function toPosixRel(input = "") {
  return String(input)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
}

/**
 * Retired local knowledge corpus. These trees were deleted from the repository;
 * the list is kept so a stale checkout cannot smuggle them back into a release.
 */
const RETIRED_KNOWLEDGE_PREFIXES = ["rag/", "skills-external/", "knowledge/", "lessons/"]

/** Paths that must never appear in the default published tarball. */
const PACK_FORBIDDEN_SUBSTRINGS = [
  "skills-external/",
  "mcp-server/vendor/WireMCP/.git/",
  "mcp-server/vendor/WireMCP/node_modules/",
  "mcp-server/vendor/WireMCP/package-lock.json",
  "rag/",
]

/** Paths that must exist in a healthy published package (relative to package root). */
export const PACK_REQUIRED_PATHS = [
  "dist/plugin/index.js",
  "dist/wiremcp/index.js",
  "agents/ctf-fast.md",
  "agents/ctf-expert.md",
  "commands/ctf.md",
  "commands/help.md",
  "scripts/cli.mjs",
]

/**
 * Whether a repo-relative path should be excluded from the default npm pack surface.
 * Used by release checks against `npm pack --dry-run --json` file lists.
 */
export function isPackExcluded(relPosixPath = "") {
  const posix = toPosixRel(relPosixPath)
  if (!posix) return false

  // npm pack lists usually look like "package/foo" or "foo"
  const normalized = posix.replace(/^package\//, "")

  for (const prefix of RETIRED_KNOWLEDGE_PREFIXES) {
    if (normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix)) return true
  }

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
  }
  return offenders
}

/**
 * Soft size thresholds for pack dry-run reporting (bytes).
 * The bundled knowledge corpus used to dominate this budget (~145MB unpacked);
 * what remains is the plugin bundle plus model-facing assets.
 */
export const PACK_SIZE_WARN = {
  compressedBytes: 4 * 1024 * 1024,
  unpackedBytes: 16 * 1024 * 1024,
}
