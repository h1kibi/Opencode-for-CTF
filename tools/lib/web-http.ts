import { createHash } from "node:crypto"

export type CappedText = {
  text: string
  truncated: boolean
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^[A-Za-z0-9.-]+:\d+(?:\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

export function parseHeadersJson(headersJson?: string, cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  if (headersJson?.trim()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(headersJson)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`invalid headersJson: expected a JSON object of primitive header values (${detail})`)
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("invalid headersJson: expected a JSON object")
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        headers[key] = String(value)
      }
    }
  }
  if (cookie?.trim()) headers.Cookie = cookie.trim()
  return headers
}

export function normalizeMethod(method?: string): string {
  const m = (method || "GET").trim().toUpperCase()
  if (!/^[A-Z]+$/.test(m)) throw new Error(`invalid HTTP method: ${method}`)
  return m
}

export async function fetchWithTimeout(url: URL, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, redirect: init.redirect ?? "manual", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function readTextCapped(response: Response, maxBytes: number): Promise<CappedText> {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    return { text: text.slice(0, maxBytes), truncated: Buffer.byteLength(text) > maxBytes }
  }
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  while (true) {
    const { done, value } = await reader.read()
    if (done || !value) break
    if (total + value.byteLength > maxBytes) {
      const remaining = Math.max(0, maxBytes - total)
      if (remaining > 0) chunks.push(value.subarray(0, remaining))
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated }
}

export async function readTextCappedString(response: Response, maxBytes: number): Promise<string> {
  return (await readTextCapped(response, maxBytes)).text
}

export function headerLines(response: Response): string[] {
  return Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}`)
}

export function unique<T>(items: T[], limit = 80): T[] {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}
