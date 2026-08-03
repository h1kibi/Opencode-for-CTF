/**
 * Cross-process file-level mutex for CTF state files.
 *
 * All CTF state files are read-modify-write (JSON load, mutate, save).
 * Under concurrent sub-agent execution in team mode, this can corrupt
 * state files. This module provides a per-key async mutex that works
 * across Node.js processes via proper-lockfile.
 *
 * Usage:
 *   await withFileLock("/path/to/file.json", async () => {
 *     const state = await loadJsonFile(...)
 *     state.foo = "bar"
 *     await saveJsonFile(...)
 *   })
 */

import { lock } from "proper-lockfile"
import type { LockOptions } from "proper-lockfile"
import * as nodeFs from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"

// ---------------------------------------------------------------------------
// In-memory queue: serializes same-process contenders for the same key so
// that only one at a time reaches the (slower) file-lock layer.
// ---------------------------------------------------------------------------
const queue = new Map<string, Promise<void>>()

async function acquireMemQueue(key: string): Promise<() => void> {
  const previous = queue.get(key) ?? Promise.resolve()
  let resolve!: () => void
  const current = new Promise<void>((r) => {
    resolve = r
  })
  const tail = previous.then(() => current)
  queue.set(key, tail)
  await previous

  return () => {
    if (queue.get(key) === tail) queue.delete(key)
    resolve()
  }
}

// ---------------------------------------------------------------------------
// Lock file layout
// ---------------------------------------------------------------------------
//
// A previous implementation initialized one process-global lock directory
// from the first key it saw. That made a single Node process place locks for
// unrelated worktrees in the first worktree's .ctf-locks directory. The
// directory is now derived per key, keeping worktree permissions, cleanup,
// and diagnostics isolated.
// ---------------------------------------------------------------------------

export interface FileLockPaths {
  key: string
  directory: string
  sentinel: string
  lockfile: string
  ownerFile: string
}

function normalizeKey(key: string): string {
  return path.resolve(key)
}

export function resolveFileLockPaths(key: string): FileLockPaths {
  const normalizedKey = normalizeKey(key)
  const directory = path.resolve(path.dirname(normalizedKey), ".ctf-locks")
  const hash = createHash("sha256").update(normalizedKey).digest("hex").slice(0, 20)
  const sentinel = path.join(directory, `${hash}.lock`)
  return {
    key: normalizedKey,
    directory,
    sentinel,
    lockfile: `${sentinel}.lock`,
    ownerFile: `${sentinel}.owner`,
  }
}

// proper-lockfile enforces a minimum stale threshold of 2 seconds. Keep the
// production default comfortably above that floor so a busy/suspended process
// is not taken over prematurely.
export const DEFAULT_FILE_LOCK_STALE_MS = 15_000
const DEFAULT_RETRIES: NonNullable<LockOptions["retries"]> = {
  retries: 40,
  factor: 1.2,
  minTimeout: 10,
  maxTimeout: 250,
}

export interface FileLockOptions {
  stale?: number
  retries?: LockOptions["retries"]
  /** Override only for controlled tests or callers that can compensate safely. */
  onCompromised?: LockOptions["onCompromised"]
}

export interface FileLockLease {
  readonly token: string
  readonly paths: FileLockPaths
  isOwned(): Promise<boolean>
  assertOwned(): Promise<void>
}

export class FileLockFencedError extends Error {
  readonly code = "ELOCKFENCED"

  constructor(key: string) {
    super(`File lock ownership was fenced before mutation: ${key}`)
    this.name = "FileLockFencedError"
  }
}

interface LockIdentity {
  dev: number
  ino: number
  birthtimeMs: number
}

function readLockIdentity(stats: nodeFs.Stats): LockIdentity {
  return { dev: stats.dev, ino: stats.ino, birthtimeMs: stats.birthtimeMs }
}

function sameLockIdentity(left: LockIdentity, right: LockIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs
}

/**
 * proper-lockfile's release callback removes the lock directory by pathname.
 * After stale takeover, an old process still has that callback and could
 * otherwise remove the replacement owner's newly-created directory. Guard
 * rmdir/rmdirSync with the directory identity captured at acquisition.
 */
function createFencedFs(paths: FileLockPaths) {
  let acquiredIdentity: LockIdentity | undefined

  const fencedFs = {
    ...nodeFs,
    rmdir(lockfilePath: string, callback: (error?: NodeJS.ErrnoException | null) => void) {
      if (!acquiredIdentity || path.resolve(lockfilePath) !== path.resolve(paths.lockfile)) {
        return nodeFs.rmdir(lockfilePath, callback)
      }
      nodeFs.stat(lockfilePath, (error, stats) => {
        if (error) return callback(error)
        if (!sameLockIdentity(acquiredIdentity!, readLockIdentity(stats))) {
          const fenced = Object.assign(new Error("Lock directory no longer belongs to this owner"), { code: "ENOENT" })
          return callback(fenced)
        }
        return nodeFs.rmdir(lockfilePath, callback)
      })
    },
    rmdirSync(lockfilePath: string) {
      if (!acquiredIdentity || path.resolve(lockfilePath) !== path.resolve(paths.lockfile)) {
        return nodeFs.rmdirSync(lockfilePath)
      }
      const stats = nodeFs.statSync(lockfilePath)
      if (!sameLockIdentity(acquiredIdentity, readLockIdentity(stats))) {
        const fenced = Object.assign(new Error("Lock directory no longer belongs to this owner"), { code: "ENOENT" })
        throw fenced
      }
      return nodeFs.rmdirSync(lockfilePath)
    },
    setAcquiredIdentity(identity: LockIdentity) {
      acquiredIdentity = identity
    },
  }

  return fencedFs
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Acquire a cross-process mutex for `key`, execute `fn`, then release.
 *
 * The callback receives a lease fence. State mutators should call
 * `lease.assertOwned()` immediately before committing a write. If a stale
 * process is resumed after another process takes over its lock, the owner
 * token no longer matches and the write must fail closed.
 *
 * The key is normalized to an absolute path before both queueing and hashing,
 * so relative/absolute aliases cannot bypass the same-process mutex.
 * The sentinel is stored under `<key directory>/.ctf-locks/`; proper-lockfile
 * creates `<sentinel>.lock` as the actual lease directory.
 *
 * `stale` and `retries` are optional primarily for controlled recovery tests
 * and callers that need a shorter bounded failure window. Production callers
 * should normally use the defaults.
 */
export async function withFileLock<T>(
  key: string,
  fn: (lease: FileLockLease) => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const paths = resolveFileLockPaths(key)
  await mkdir(paths.directory, { recursive: true })
  const sentinelHandle = await open(paths.sentinel, "a")
  await sentinelHandle.close()

  const leaveMemQueue = await acquireMemQueue(paths.key)

  let releaseFileLock: (() => void) | null = null
  let released = false
  const fencedFs = createFencedFs(paths)
  try {
    releaseFileLock = await lock(paths.sentinel, {
      retries: options.retries ?? DEFAULT_RETRIES,
      stale: options.stale ?? DEFAULT_FILE_LOCK_STALE_MS,
      realpath: false, // don't resolve symlinks (Windows compat)
      fs: fencedFs,
      ...(options.onCompromised ? { onCompromised: options.onCompromised } : {}),
    })

    fencedFs.setAcquiredIdentity(readLockIdentity(await stat(paths.lockfile)))
    const token = randomUUID()
    await writeFile(paths.ownerFile, `${token}\n`, "utf8")
    const lease: FileLockLease = {
      token,
      paths,
      async isOwned() {
        if (released) return false
        try {
          const [owner, lockStats] = await Promise.all([readFile(paths.ownerFile, "utf8"), stat(paths.lockfile)])
          return owner.trim() === token && lockStats.isDirectory()
        } catch {
          return false
        }
      },
      async assertOwned() {
        if (!(await this.isOwned())) throw new FileLockFencedError(paths.key)
      },
    }

    return await fn(lease)
  } finally {
    released = true
    // Keep the owner marker outside proper-lockfile's lease directory. The
    // library removes stale lease directories with rmdir, so metadata inside
    // that directory would make takeover fail with ENOTEMPTY. The next owner
    // overwrites this marker; a released lease is still non-owned because its
    // lease directory no longer exists.
    if (releaseFileLock) {
      try {
        await releaseFileLock()
      } catch {
        // Best-effort cleanup. The lock's stale lease remains recoverable if
        // the filesystem rejects release during shutdown.
      }
    }
    leaveMemQueue()
  }
}
