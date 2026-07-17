import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { withFileLock } from "./file-lock.ts"

export async function loadJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function saveJsonFile(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function removeFileIfExists(file: string) {
  try {
    await rm(file, { force: true })
  } catch {
    // ignore cleanup failures
  }
}

export function nowIso() {
  return new Date().toISOString()
}

export function isoPlusMs(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

export function isFutureIso(value?: string) {
  if (!value) return false
  const time = Date.parse(value)
  if (Number.isNaN(time)) return false
  return time > Date.now()
}

/**
 * Atomically read, mutate, and save a JSON file using a per-file lock.
 * The mutator receives the current value (or fallback if missing/empty).
 * The result is always written back to disk.
 * Throws if the mutator throws; the file is never written in that case.
 */
export async function atomicUpdateJsonFile<T>(
  file: string,
  fallback: T,
  mutator: (current: T) => T | Promise<T>,
): Promise<T> {
  return withFileLock(file, async () => {
    const current = await loadJsonFile<T>(file, fallback)
    const next = await mutator(current)
    await saveJsonFile(file, next)
    return next
  })
}
