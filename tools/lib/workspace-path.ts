import { lstatSync, realpathSync } from "node:fs"
import path from "node:path"

/**
 * Reject targets whose nearest existing ancestor is a symlink escaping the
 * workspace, or whose trailing components contain symlinks pointing outside.
 *
 * The check is conservative: symlinks that stay INSIDE the workspace are
 * allowed; the returned path stays lexical (no behavior change for callers).
 * The old check was purely lexical (`path.resolve` + relative), which
 * symlink/junction traversal could bypass.
 */
function assertNoSymlinkEscape(base: string, target: string, input: string): void {
  let realBase: string
  try {
    realBase = realpathSync(base)
  } catch {
    return // base missing (unusual); lexical containment already passed
  }

  // Collect the components of target relative to base, then probe each one
  // under the REAL base directory.
  const components: string[] = []
  let current = target
  let guard = 0
  while (current !== base && guard++ < 100) {
    components.unshift(path.basename(current))
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  let probe = realBase
  for (const component of components) {
    probe = path.join(probe, component)
    let stats
    try {
      stats = lstatSync(probe)
    } catch {
      continue // component not created yet — nothing to escape through
    }
    if (stats.isSymbolicLink()) {
      const resolved = realpathSync(probe)
      const rel = path.relative(realBase, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`path escapes the workspace via symlink: ${input} -> ${resolved}`)
      }
    }
  }
}

export type WorkspaceLikeContext = { directory?: string; worktree?: string } | undefined

/**
 * OpenCode normally provides a useful worktree, but some Windows launches that
 * start from a drive root report `C:\\` (or another filesystem root) as the
 * worktree while `directory` still points at the active benchmark/project.
 * Treating that root as the artifact workspace makes a safe relative path such
 * as `work/python-inline/run.py` resolve to `C:\\work\\...` and can even make
 * `mkdir` attempt to operate on `C:\\`. Prefer the active directory in this
 * narrow, malformed-context case; keep the worktree-first behavior everywhere
 * else.
 */
function isFilesystemRoot(value: string): boolean {
  const resolved = path.resolve(value)
  return resolved === path.parse(resolved).root
}

export function workspaceRootFromContext(context?: WorkspaceLikeContext): string {
  const worktree = context?.worktree
  const directory = context?.directory
  if (worktree && directory && isFilesystemRoot(worktree) && !isFilesystemRoot(directory)) return directory
  return worktree ?? directory ?? process.cwd()
}

/** Directory relative to which user-supplied paths should normally be interpreted. */
export function directoryFromContext(context?: WorkspaceLikeContext): string {
  return context?.directory ?? workspaceRootFromContext(context)
}

/**
 * Resolve a workspace-relative path with containment enforcement.
 *
 * Fast lexical containment check first (rejects `../` and absolute escapes),
 * then a symlink/junction-aware guard that verifies every component of the
 * target (under the realpath of the base) does not point outside.
 */
export function resolveInsideWorkspace(contextDir: string, input = "."): string {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input || ".")
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  assertNoSymlinkEscape(base, target, input)
  return target
}

/**
 * Resolve an input path relative to the active challenge directory while enforcing
 * that the final path remains inside the broader OpenCode worktree/workspace.
 * This keeps `../bin/chall` style CTF layouts usable when context.directory is a
 * challenge subdirectory, without falling back to process.cwd() or permitting
 * workspace escapes.
 */
export function resolveFromDirectoryInsideWorkspace(directory: string, workspaceRoot: string, input = "."): string {
  const base = path.resolve(directory)
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(base, input || ".")
  const rel = path.relative(root, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path must stay inside the current workspace: ${input}`)
  }
  assertNoSymlinkEscape(root, target, input)
  return target
}
