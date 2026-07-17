/**
 * Path security policy — shared utility for all CTF tools.
 *
 * Provides:
 *  - isSensitivePath()       — reject .env, SSH keys, cloud credentials, etc.
 *  - resolveAllowedPath()    — resolve a user-supplied path within CTF_ALLOWED_ROOTS
 *  - assertAllowedRoots()    — throw if target is outside the configured root set
 *
 * Usage:
 *   import { resolveAllowedPath } from "./lib/path-policy.ts"
 *   const safe = await resolveAllowedPath(args.target, context)
 */

import { realpath } from "node:fs/promises"
import path from "node:path"

export type ToolContext = {
  directory: string
  worktree?: string
}

// ---------------------------------------------------------------------------
// Sensitive path detection
// ---------------------------------------------------------------------------

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".git-credentials",
  "credentials",
  "credentials.json",
  "token.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "known_hosts",
])

function normalizedForComparison(input: string) {
  const normalized = path.normalize(input)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

export function isSensitivePath(input: string): boolean {
  const normalized = normalizedForComparison(input)
  const base = path.basename(normalized)

  // Exact-name matches
  if (
    SENSITIVE_NAMES.has(base) ||
    base.startsWith(".env.") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pem") ||
    base.endsWith(".pfx")
  ) {
    return true
  }

  // Directory-component matches (check for well-known config dirs anywhere in the path)
  const sep = path.sep
  const sensitiveDirSegments = [
    `${sep}.aws${sep}`,
    `${sep}.azure${sep}`,
    `${sep}.config${sep}gcloud${sep}`,
    `${sep}.docker${sep}`,
    `${sep}.gcloud${sep}`,
    `${sep}.gnupg${sep}`,
    `${sep}.kube${sep}`,
    `${sep}.ssh${sep}`,
  ]
  return sensitiveDirSegments.some((segment) => normalized.includes(segment))
}

// ---------------------------------------------------------------------------
// Root resolution
// ---------------------------------------------------------------------------

function getConfiguredRoots(): string[] {
  return (process.env.CTF_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(normalizedForComparison(root), normalizedForComparison(target))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

/**
 * Resolve a user-supplied path against CTF-allowed roots and sensitive-path rules.
 *
 * The allowed roots are:
 *  1. context.directory   (the project / challenge dir)
 *  2. context.worktree    (the OpenCode worktree)
 *  3. $CTF_ALLOWED_ROOTS  (env var, platform-delimited)
 *
 * Throws if the resolved path is outside all roots, or (by default) if it's
 * a sensitive file path.
 */
export async function resolveAllowedPath(
  input: string,
  context: ToolContext,
  options?: { allowSensitive?: boolean },
): Promise<string> {
  const requested = path.resolve(context.directory, input)
  let target: string
  try {
    target = await realpath(requested)
  } catch {
    // realpath may fail if the file doesn't exist yet (e.g., about to write).
    // Use the undereferenced path in that case.
    target = requested
  }

  const roots = Array.from(
    new Set([context.directory, context.worktree, ...getConfiguredRoots()].filter(Boolean) as string[]),
  )
  const resolvedRoots = await Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(path.resolve(root))
      } catch {
        return path.resolve(root)
      }
    }),
  )

  if (!resolvedRoots.some((root) => isInside(target, root))) {
    throw new Error(
      `Refusing path outside allowed CTF roots: ${input}\n` +
        `Resolved: ${target}\n` +
        `Allowed roots: ${resolvedRoots.join(", ")}`,
    )
  }

  if (!options?.allowSensitive && isSensitivePath(target)) {
    throw new Error(`Refusing sensitive file path: ${input}`)
  }

  return target
}

/**
 * Synchronous variant for tools that don't need the full realpath dance.
 * Only checks roots without following symlinks.
 */
export function assertAllowedRootsSync(target: string, roots: string[]): string {
  const resolved = path.resolve(target)
  const ok = roots.some((root) => {
    const rr = path.resolve(root)
    return resolved === rr || resolved.startsWith(rr + path.sep)
  })
  if (!ok) {
    throw new Error(`Refusing path outside allowed CTF roots. target=${resolved}, roots=${roots.join(", ")}`)
  }
  return resolved
}
