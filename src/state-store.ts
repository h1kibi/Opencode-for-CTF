import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

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
