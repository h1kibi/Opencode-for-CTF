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
import { createHash } from "node:crypto"
import { mkdir, open } from "node:fs/promises"
import path from "node:path"

// ---------------------------------------------------------------------------
// In-memory queue — serialises same-process contenders for the same key so
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
// Lock file directory (lazy-init, under runtime/state/.locks)
// ---------------------------------------------------------------------------
let lockDir: string | undefined

function ensureLockDir(key: string) {
  if (lockDir) return
  const absoluteKey = path.resolve(key)
  const root = path.parse(absoluteKey).root
  const anchor = absoluteKey.startsWith(root) ? path.dirname(absoluteKey) : process.cwd()
  lockDir = path.resolve(anchor, ".ctf-locks")
}

function resolveLockPath(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 20)
  return path.join(lockDir!, `${hash}.lock`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Acquire a cross-process mutex for `key`, execute `fn`, then release.
 *
 * The key should be the **absolute path** of the JSON state file you intend
 * to read-modify-write.  For non-path keys (e.g. test-only use) a hash-based
 * sentinel file is created under `runtime/state/.locks/`.
 *
 * Same-process callers are queued in memory so the file-lock is only
 * contended across processes or when a prior holder releases.
 */
export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  ensureLockDir(key)

  const sentinel = resolveLockPath(key)
  await mkdir(path.dirname(sentinel), { recursive: true })
  const sentinelHandle = await open(sentinel, "a")
  await sentinelHandle.close()

  const leaveMemQueue = await acquireMemQueue(key)

  let releaseFileLock: (() => void) | null = null
  try {
    releaseFileLock = await lock(sentinel, {
      retries: {
        retries: 40,
        factor: 1.2,
        minTimeout: 10,
        maxTimeout: 250,
      },
      stale: 15_000, // locks older than 15 s are considered stale
      realpath: false, // don't resolve symlinks (Windows compat)
    })

    return await fn()
  } finally {
    if (releaseFileLock) {
      try {
        await releaseFileLock()
      } catch {
        /* best-effort */
      }
    }
    leaveMemQueue()
  }
}
