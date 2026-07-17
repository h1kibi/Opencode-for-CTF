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
import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

// ---------------------------------------------------------------------------
// In-memory queue — serialises same-process contenders for the same key so
// that only one at a time reaches the (slower) file-lock layer.
// ---------------------------------------------------------------------------
const queue = new Map<string, Promise<void>>()

async function acquireMemQueue(key: string): Promise<() => void> {
  while (true) {
    const existing = queue.get(key)
    if (!existing) break
    await existing
  }

  let resolve: () => void
  const slot = new Promise<void>((r) => {
    resolve = r
  })
  queue.set(key, slot)

  return () => {
    queue.delete(key)
    resolve!()
  }
}

// ---------------------------------------------------------------------------
// Lock file directory (lazy-init, under runtime/state/.locks)
// ---------------------------------------------------------------------------
let lockDir: string | undefined

function ensureLockDir() {
  if (lockDir) return
  // Use the plugin root directory for lock files, derived from the first
  // locked path or process.cwd().  INIT_CWD is intentionally NOT used here
  // because it is an npm-specific variable and may be empty when the plugin
  // is loaded directly by the OpenCode runtime.
  const root = process.cwd()
  lockDir = path.resolve(root, "runtime", "state", ".locks")
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
  ensureLockDir()

  const sentinel = resolveLockPath(key)
  await mkdir(path.dirname(sentinel), { recursive: true })
  if (!existsSync(sentinel)) {
    // proper-lockfile requires the sentinel file to exist on disk.
    await writeFile(sentinel, "", "utf-8")
  }

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
        releaseFileLock()
      } catch {
        /* best-effort */
      }
    }
    leaveMemQueue()
  }
}
