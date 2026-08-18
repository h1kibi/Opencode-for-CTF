import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fetchWithTimeout, readTextCapped } from "./web-http.ts"

export type RequestBudgetOptions = {
  maxRequests?: number
  maxStateChangingRequests?: number
  minIntervalMs?: number
  reuseSession?: boolean
  stopOnConnectionReset?: boolean
  timeoutMs?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  maxConsecutiveFailures?: number
  allowedOrigin?: string
}

export type RequestObservation = {
  id: string
  label: string
  method: string
  url: string
  stateChanging: boolean
  startedAt: string
  elapsedMs: number
  status?: number
  ok?: boolean
  responseHash?: string
  responseBytes?: number
  setCookies?: string[]
  error?: string
  connectionReset?: boolean
  consecutiveFailures?: number
}

export class BudgetStopError extends Error {
  readonly code: "budget_exhausted" | "state_budget_exhausted" | "connection_reset" | "unstable" | "origin_blocked"
  constructor(code: BudgetStopError["code"], message: string) {
    super(message)
    this.name = "BudgetStopError"
    this.code = code
  }
}

function isConnectionReset(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return /ECONNRESET|socket hang up|fetch failed|network|connection reset|aborted/i.test(text)
}

function getSetCookies(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof getSetCookie === "function") return getSetCookie.call(headers)
  const value = headers.get("set-cookie")
  return value ? [value] : []
}

export class CtfRequestBudget {
  readonly options: Required<RequestBudgetOptions>
  readonly observations: RequestObservation[] = []
  readonly cookies = new Map<string, string>()
  routeState: "ready" | "blocked" | "unstable" = "ready"
  private lastRequestAt = 0
  private sequence = 0
  private consecutiveFailures = 0

  constructor(options: RequestBudgetOptions = {}, initialCookie?: string) {
    this.options = {
      maxRequests: clamp(options.maxRequests ?? 30, 1, 500),
      maxStateChangingRequests: clamp(options.maxStateChangingRequests ?? 10, 0, 500),
      minIntervalMs: clamp(options.minIntervalMs ?? 800, 0, 60_000),
      reuseSession: options.reuseSession ?? true,
      stopOnConnectionReset: options.stopOnConnectionReset ?? true,
      timeoutMs: clamp(options.timeoutMs ?? 8_000, 250, 120_000),
      baseBackoffMs: clamp(options.baseBackoffMs ?? 500, 0, 60_000),
      maxBackoffMs: clamp(options.maxBackoffMs ?? 8_000, 0, 120_000),
      maxConsecutiveFailures: clamp(options.maxConsecutiveFailures ?? 3, 1, 20),
      allowedOrigin: options.allowedOrigin || "",
    }
    if (initialCookie) this.mergeCookieHeader(initialCookie)
  }

  get requests() { return this.observations.length }
  get stateChangingRequests() { return this.observations.filter((item) => item.stateChanging).length }
  get currentBudget() { return `${this.requests}/${this.options.maxRequests}` }

  private mergeCookieHeader(value: string) {
    for (const pair of value.split(/;\s*/)) {
      const index = pair.indexOf("=")
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  cookieHeader(): string | undefined {
    if (!this.options.reuseSession || this.cookies.size === 0) return undefined
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ")
  }

  async request(url: string | URL, init: RequestInit = {}, stateChanging = false, label = "request", maxBytes = 256_000): Promise<{ text: string; observation: RequestObservation; headers: Headers }> {
    const target = new URL(String(url))
    if (this.options.allowedOrigin && target.origin !== this.options.allowedOrigin) {
      throw new BudgetStopError("origin_blocked", `Refusing request outside the allowed origin (${this.options.allowedOrigin}).`)
    }
    if (this.routeState !== "ready") {
      const code = this.routeState === "unstable" || this.routeState === "blocked" ? "unstable" : "connection_reset"
      throw new BudgetStopError(code, `Route is ${this.routeState}; refusing further requests.`)
    }
    if (this.requests >= this.options.maxRequests) throw new BudgetStopError("budget_exhausted", `Request budget exhausted (${this.currentBudget}).`)
    if (stateChanging && this.stateChangingRequests >= this.options.maxStateChangingRequests) {
      throw new BudgetStopError("state_budget_exhausted", `State-changing request budget exhausted (${this.stateChangingRequests}/${this.options.maxStateChangingRequests}).`)
    }
    const nowMs = Date.now()
    const backoffMs = this.consecutiveFailures > 0
      ? Math.min(this.options.maxBackoffMs, this.options.baseBackoffMs * (2 ** (this.consecutiveFailures - 1)))
      : 0
    const waitMs = Math.max(0, Math.max(this.options.minIntervalMs, backoffMs) - (nowMs - this.lastRequestAt))
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    const headers = new Headers(init.headers)
    const cookie = this.cookieHeader()
    if (cookie && !headers.has("cookie")) headers.set("cookie", cookie)
    const method = String(init.method || "GET").toUpperCase()
    const id = `probe-${String(++this.sequence).padStart(3, "0")}`
    const startedAt = new Date().toISOString()
    const started = Date.now()
    const observation: RequestObservation = { id, label, method, url: String(url), stateChanging, startedAt, elapsedMs: 0 }
    this.observations.push(observation)
    this.lastRequestAt = started
    try {
      const response = await fetchWithTimeout(target, { ...init, headers }, this.options.timeoutMs)
      const capped = await readTextCapped(response, maxBytes)
      observation.elapsedMs = Date.now() - started
      observation.status = response.status
      observation.ok = response.ok
      observation.responseBytes = Buffer.byteLength(capped.text)
      observation.responseHash = createHash("sha256").update(capped.text).digest("hex").slice(0, 16)
      this.consecutiveFailures = 0
      observation.consecutiveFailures = 0
      const setCookies = getSetCookies(response.headers)
      observation.setCookies = setCookies
      for (const setCookie of setCookies) {
        const pair = setCookie.split(";", 1)[0]
        this.mergeCookieHeader(pair)
      }
      return { text: capped.text, observation, headers: response.headers }
    } catch (error) {
      observation.elapsedMs = Date.now() - started
      observation.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      observation.connectionReset = isConnectionReset(error)
      this.consecutiveFailures++
      observation.consecutiveFailures = this.consecutiveFailures
      if (observation.connectionReset && this.options.stopOnConnectionReset) {
        this.routeState = "unstable"
        throw new BudgetStopError("connection_reset", `${observation.error}; stopping to avoid repeated retries.`)
      }
      if (this.consecutiveFailures >= this.options.maxConsecutiveFailures) {
        this.routeState = "blocked"
        throw new BudgetStopError("unstable", `${observation.error}; route marked blocked after ${this.consecutiveFailures} consecutive failures.`)
      }
      throw error
    }
  }

  summary() {
    return {
      requests: this.requests,
      state_changing_requests: this.stateChangingRequests,
      maxRequests: this.options.maxRequests,
      maxStateChangingRequests: this.options.maxStateChangingRequests,
      minIntervalMs: this.options.minIntervalMs,
      baseBackoffMs: this.options.baseBackoffMs,
      maxBackoffMs: this.options.maxBackoffMs,
      consecutiveFailures: this.consecutiveFailures,
      route_state: this.routeState,
      observations: this.observations,
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}

export async function writeProbeEvidence(directory: string, challenge: string, payload: unknown): Promise<string> {
  const slug = challenge.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "web-probe"
  const root = path.join(directory, "work", "ctf-evidence", slug)
  const probes = path.join(root, "probes")
  await mkdir(probes, { recursive: true })
  const id = `probe-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.json`
  const file = path.join(probes, id)
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return path.relative(directory, file).replaceAll(path.sep, "/")
}
