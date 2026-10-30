import { lookup } from "node:dns/promises"
import { createHash } from "node:crypto"
import { isIP } from "node:net"
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

type AllowedHost = { hostname: string; port?: number }

export class WebHostPolicyError extends Error {
  readonly code = "web_host_blocked"

  constructor(message: string) {
    super(message)
    this.name = "WebHostPolicyError"
  }
}

function canonicalHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
}

function ipv4Parts(hostname: string): number[] | undefined {
  const parts = hostname.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return undefined
  const values = parts.map(Number)
  return values.every((value) => value >= 0 && value <= 255) ? values : undefined
}

function ipv6Parts(hostname: string): number[] | undefined {
  const halves = hostname.toLowerCase().split("::")
  if (halves.length > 2) return undefined
  const parse = (part: string): number[] | undefined => {
    if (!part) return []
    const values: number[] = []
    for (const piece of part.split(":")) {
      if (piece.includes(".")) {
        const ipv4 = ipv4Parts(piece)
        if (!ipv4) return undefined
        values.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
      } else if (/^[0-9a-f]{1,4}$/.test(piece)) values.push(Number.parseInt(piece, 16))
      else return undefined
    }
    return values
  }
  const left = parse(halves[0])
  const right = parse(halves[1] ?? "")
  if (!left || !right || (left.length === 0 && right.length === 0 && hostname !== "::")) return undefined
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined
  return [...left, ...(missing > 0 ? Array.from({ length: missing }, () => 0) : []), ...right]
}

function isRestrictedIp(hostname: string): boolean {
  const normalized = canonicalHostname(hostname)
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const parts = ipv4Parts(normalized)
    if (!parts) return true
    const [a, b] = parts
    return (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && b >= 18 && b <= 19) ||
      (a === 203 && b === 0) ||
      a >= 224
    )
  }
  if (ipVersion !== 6) return false
  const parts = ipv6Parts(normalized)
  if (!parts || parts.length !== 8) return true
  const allZero = parts.every((part) => part === 0)
  const mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (mapped) {
    const mappedIpv4 = `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`
    return isRestrictedIp(mappedIpv4)
  }
  return (
    allZero ||
    (parts[0] & 0xfe00) === 0xfc00 ||
    (parts[0] & 0xffc0) === 0xfe80 ||
    (parts[0] & 0xff00) === 0xff00 ||
    (parts[0] === 0x2001 && parts[1] === 0x0db8)
  )
}

function isLoopbackIp(hostname: string): boolean {
  const normalized = canonicalHostname(hostname)
  if (isIP(normalized) === 4) return ipv4Parts(normalized)?.[0] === 127
  const parts = ipv6Parts(normalized)
  if (!parts) return false
  if (parts.every((part, index) => (index === 7 ? part === 1 : part === 0))) return true
  return parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff && parts[6] >> 8 === 127
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = canonicalHostname(hostname)
  if (normalized === "localhost" || normalized === "localhost.localdomain") return true
  return isLoopbackIp(normalized)
}

function isRestrictedHostname(hostname: string): boolean {
  const normalized = canonicalHostname(hostname)
  return ["internal", "local", "lan", "home", "corp"].some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  )
}

function parseAllowedHosts(): AllowedHost[] {
  const entries: AllowedHost[] = []
  for (const raw of (process.env.CTF_ALLOWED_HOSTS ?? "").split(",")) {
    const token = raw.trim()
    if (!token) continue
    try {
      const parsed = new URL(`http://${token}`)
      if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) continue
      const portMatch = token.startsWith("[")
        ? token.match(/^\[[^\]]+\](?::(\d+))?$/)
        : token.match(/^[^:]+(?::(\d+))?$/)
      if (!portMatch) continue
      const port = portMatch[1] === undefined ? undefined : Number(portMatch[1])
      if (port !== undefined && (port < 0 || port > 65535)) continue
      entries.push({ hostname: canonicalHostname(parsed.hostname), port })
    } catch {
      // Malformed entries must not broaden access.
    }
  }
  return entries
}

function isAllowedHost(url: URL): boolean {
  const hostname = canonicalHostname(url.hostname)
  return parseAllowedHosts().some((entry) => {
    if (entry.hostname !== hostname) return false
    if (entry.port === undefined) return true
    const effectivePort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80
    return entry.port === effectivePort
  })
}

export function validateWebUrl(input: string | URL): URL {
  let url: URL
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input)
  } catch {
    throw new WebHostPolicyError(`Refusing invalid Web URL: ${String(input)}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebHostPolicyError(`Refusing unsupported Web URL scheme: ${url.protocol || "(missing)"}`)
  }
  const hostname = canonicalHostname(url.hostname)
  if (
    !isLoopbackHost(hostname) &&
    (isRestrictedIp(hostname) || isRestrictedHostname(hostname)) &&
    !isAllowedHost(url)
  ) {
    throw new WebHostPolicyError(`Refusing restricted Web host: ${hostname}${url.port ? `:${url.port}` : ""}`)
  }
  return url
}

async function validateResolvedWebHost(url: URL): Promise<void> {
  const hostname = canonicalHostname(url.hostname)
  if (isIP(hostname) || isLoopbackHost(hostname) || isAllowedHost(url)) return
  let addresses: Array<{ address: string }>
  let dnsTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        dnsTimeout = setTimeout(() => reject(new Error("DNS lookup timed out")), 1_500)
      }),
    ])
  } catch {
    throw new WebHostPolicyError(`Refusing Web host with unresolved DNS: ${hostname}`)
  } finally {
    clearTimeout(dnsTimeout)
  }
  if (
    !addresses.length ||
    addresses.some((address) => isRestrictedIp(address.address) || isLoopbackIp(address.address))
  ) {
    throw new WebHostPolicyError(`Refusing Web host resolving to a restricted address: ${hostname}`)
  }
}

export async function fetchWithTimeout(url: URL, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const validated = validateWebUrl(url)
  await validateResolvedWebHost(validated)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(validated, { ...init, redirect: init.redirect ?? "manual", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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
