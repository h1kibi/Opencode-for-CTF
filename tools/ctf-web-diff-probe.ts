import { createHash } from "node:crypto"
import { tool } from "@opencode-ai/plugin"

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^[A-Za-z0-9.-]+:\d+(?:\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

function parseHeadersJson(headersJson?: string, cookie?: string) {
  const headers: Record<string, string> = {}
  if (headersJson?.trim()) {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") headers[key] = String(value)
    }
  }
  if (cookie?.trim()) headers.Cookie = cookie.trim()
  return headers
}

async function fetchWithTimeout(url: URL, init: RequestInit = {}, ms = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, redirect: init.redirect ?? "manual", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readTextCapped(response: Response, maxBytes: number) {
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

function normalizeMethod(method?: string) {
  const m = (method || "GET").trim().toUpperCase()
  if (!/^[A-Z]+$/.test(m)) throw new Error(`invalid HTTP method: ${method}`)
  return m
}

function shortHash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}

function bodySnippet(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 160)
}

type Summary = {
  label: string
  url: string
  method: string
  status: number
  redirected: string
  contentType: string
  length: number
  hash: string
  truncated: boolean
  snippet: string
  setCookieCount: number
}

async function doRequest(label: string, url: URL, method: string, headers: Record<string, string>, body?: string) {
  const init: RequestInit = { method, headers }
  if (body !== undefined && body.length > 0 && method !== "GET" && method !== "HEAD") init.body = body
  const response = await fetchWithTimeout(url, init)
  const text = await readTextCapped(response, 600000)
  const setCookieCount = Array.from(response.headers.entries()).filter(([k]) => k.toLowerCase() === "set-cookie").length
  const summary: Summary = {
    label,
    url: url.toString(),
    method,
    status: response.status,
    redirected: response.headers.get("location") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    length: Buffer.byteLength(text.text),
    hash: shortHash(text.text),
    truncated: text.truncated,
    snippet: bodySnippet(text.text),
    setCookieCount,
  }
  return summary
}

function diffSummary(a: Summary, b: Summary) {
  const deltas: string[] = []
  if (a.status !== b.status) deltas.push(`status ${a.status}->${b.status}`)
  if (a.redirected !== b.redirected) deltas.push(`location changed`)
  if (a.contentType !== b.contentType) deltas.push(`content-type changed`)
  const lenDiff = Math.abs(a.length - b.length)
  if (lenDiff > 0) deltas.push(`length_delta ${lenDiff}`)
  if (a.hash !== b.hash) deltas.push(`body_hash changed`)
  if (a.setCookieCount !== b.setCookieCount) deltas.push(`set-cookie-count ${a.setCookieCount}->${b.setCookieCount}`)
  if (!deltas.length) deltas.push("no_observable_delta")
  return deltas
}

function mutatePath(url: URL, style?: string) {
  const u = new URL(url.toString())
  const p = u.pathname || "/"
  const s = (style || "dot_segment").toLowerCase()
  if (s === "double_slash") u.pathname = p.replace(/^\//, "//")
  else if (s === "encoded_slash") u.pathname = p.replace(/\//g, "%2f")
  else if (s === "semicolon") u.pathname = `${p};x=1`
  else u.pathname = `/./${p.replace(/^\//, "")}`
  return u
}

function mutateBody(body: string | undefined, parameter: string, value: string) {
  if (!body) return body
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    parsed[parameter] = value
    return JSON.stringify(parsed)
  } catch {
    const params = new URLSearchParams(body)
    params.set(parameter, value)
    return params.toString()
  }
}

export default tool({
  description: "CTF Web differential probe v8: run exactly one baseline and one mutant request for an authorized endpoint. Tests method/content-type/header/cookie/query/body/duplicate-param/path-normalization/encoding/auth-state/cache-key differentials and returns an observation suitable for ctf-decision-state observe.",
  args: {
    url: tool.schema.string().describe("Authorized endpoint URL."),
    variant: tool.schema.string().describe("query | duplicate_param | body | content_type | header | cookie | method | path_normalization | encoding | auth_state | cache_key"),
    method: tool.schema.string().optional().describe("Baseline method. Default GET."),
    headersJson: tool.schema.string().optional().describe("Baseline JSON headers."),
    cookie: tool.schema.string().optional().describe("Baseline Cookie header."),
    body: tool.schema.string().optional().describe("Baseline request body. Ignored for GET/HEAD."),
    parameter: tool.schema.string().optional().describe("Parameter/key to mutate for query/body/duplicate_param/encoding."),
    baselineValue: tool.schema.string().optional().describe("Baseline value to set when variant needs a controlled baseline."),
    mutantValue: tool.schema.string().optional().describe("Mutant value/header/cookie/content-type. Default harmless marker."),
    mutantHeaderName: tool.schema.string().optional().describe("Header to mutate for variant=header."),
    mutantMethod: tool.schema.string().optional().describe("Method for variant=method. Default OPTIONS."),
    pathStyle: tool.schema.string().optional().describe("For path_normalization: dot_segment | double_slash | encoded_slash | semicolon."),
    allowStateChanging: tool.schema.boolean().optional().describe("Required for unsafe mutant methods beyond GET/HEAD/OPTIONS."),
  },
  async execute(args) {
    const baseUrl = new URL(normalizeUrl(args.url))
    const variant = args.variant.trim().toLowerCase()
    const method = normalizeMethod(args.method)
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const baseline = new URL(baseUrl.toString())
    let baselineMethod = method
    let baselineHeaders = { ...headers }
    let baselineBody = args.body
    const mutant = new URL(baseUrl.toString())
    let mutantMethod = method
    let mutantHeaders = { ...headers }
    let mutantBody = args.body
    const marker = args.mutantValue ?? "ctf_diff_marker_1"
    const param = args.parameter ?? "ctf_probe"

    if ((method === "GET" || method === "HEAD") && baselineBody) baselineBody = undefined

    if (variant === "query") {
      if (args.baselineValue !== undefined) baseline.searchParams.set(param, args.baselineValue)
      mutant.searchParams.set(param, marker)
    } else if (variant === "duplicate_param") {
      if (args.baselineValue !== undefined) baseline.searchParams.set(param, args.baselineValue)
      mutant.searchParams.set(param, args.baselineValue ?? "base")
      mutant.searchParams.append(param, marker)
    } else if (variant === "body") {
      if (!args.body) return "BLOCK: variant=body requires a baseline body"
      baselineBody = mutateBody(args.body, param, args.baselineValue ?? "base")
      mutantBody = mutateBody(args.body, param, marker)
    } else if (variant === "content_type") {
      baselineHeaders["Content-Type"] = baselineHeaders["Content-Type"] ?? "application/x-www-form-urlencoded"
      mutantHeaders["Content-Type"] = marker === "ctf_diff_marker_1" ? "application/json" : marker
    } else if (variant === "header") {
      const name = args.mutantHeaderName || "X-CTF-Probe"
      mutantHeaders[name] = marker
    } else if (variant === "cookie") {
      mutantHeaders.Cookie = marker
    } else if (variant === "auth_state") {
      if (marker === "ctf_diff_marker_1") delete mutantHeaders.Cookie
      else mutantHeaders.Cookie = marker
    } else if (variant === "method") {
      mutantMethod = normalizeMethod(args.mutantMethod || "OPTIONS")
      if (!["GET", "HEAD", "OPTIONS"].includes(mutantMethod) && args.allowStateChanging !== true) {
        return `BLOCK: mutantMethod=${mutantMethod} may mutate state; set allowStateChanging=true only when authorized and intended`
      }
      if (mutantMethod === "GET" || mutantMethod === "HEAD") mutantBody = undefined
    } else if (variant === "path_normalization") {
      const mutated = mutatePath(mutant, args.pathStyle)
      mutant.pathname = mutated.pathname
    } else if (variant === "encoding") {
      const current = args.baselineValue ?? baseUrl.searchParams.get(param) ?? "../flag"
      baseline.searchParams.set(param, current)
      mutant.searchParams.set(param, encodeURIComponent(current))
    } else if (variant === "cache_key") {
      mutant.searchParams.set("ctf_cache_probe", marker)
      mutantHeaders["X-CTF-Cache-Probe"] = marker
    } else {
      return `BLOCK: unknown variant '${args.variant}'`
    }

    if ((baselineMethod === "GET" || baselineMethod === "HEAD") && baselineBody) baselineBody = undefined
    if ((mutantMethod === "GET" || mutantMethod === "HEAD") && mutantBody) mutantBody = undefined

    const a = await doRequest("baseline", baseline, baselineMethod, baselineHeaders, baselineBody)
    const b = await doRequest("mutant", mutant, mutantMethod, mutantHeaders, mutantBody)
    const deltas = diffSummary(a, b)
    const newDifferential = deltas.some((x) => x !== "no_observable_delta")
    const confidence = newDifferential ? (deltas.some((x) => x.startsWith("status") || x.includes("location") || x.includes("set-cookie")) ? 0.72 : 0.55) : 0.18
    const hypothesis = newDifferential
      ? `${variant} affects observable response; promote only if repeated or linked to flag/control primitive`
      : `${variant} did not produce an observable differential under this baseline`

    return [
      `variant: ${variant}`,
      `verdict: ${newDifferential ? "differential_observed" : "no_differential"}`,
      `confidence: ${confidence}`,
      "baseline:",
      `- method: ${a.method}`,
      `- url: ${a.url}`,
      `- status: ${a.status}`,
      `- content_type: ${a.contentType || "none"}`,
      `- length: ${a.length}`,
      `- hash: ${a.hash}`,
      `- location: ${a.redirected || "none"}`,
      `- snippet: ${a.snippet || "none"}`,
      "mutant:",
      `- method: ${b.method}`,
      `- url: ${b.url}`,
      `- status: ${b.status}`,
      `- content_type: ${b.contentType || "none"}`,
      `- length: ${b.length}`,
      `- hash: ${b.hash}`,
      `- location: ${b.redirected || "none"}`,
      `- snippet: ${b.snippet || "none"}`,
      "delta:",
      ...deltas.map((x) => `- ${x}`),
      `hypothesis: ${hypothesis}`,
      `new_differential: ${newDifferential}`,
      `next_probe: ${newDifferential ? "repeat with a clean harmless marker or test the adjacent auth/parser boundary" : "rerank; do not try same-family payload strings without a new oracle"}`,
      "decision_state_observe_hint:",
      `- {"family":"${variant}","result":"${newDifferential ? "differential" : "no_differential"}","newDifferential":${newDifferential},"evidence":"${variant} ${deltas.join("; ").replace(/"/g, "'")}"}`,
    ].join("\n")
  },
})
