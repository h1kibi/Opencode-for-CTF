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
    for (const [key, value] of Object.entries(parsed)) if (["string", "number", "boolean"].includes(typeof value)) headers[key] = String(value)
  }
  if (cookie?.trim()) headers.Cookie = cookie.trim()
  return headers
}

function unique(items: string[], limit = 120) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function sameOrigin(base: URL, candidate: string) {
  try {
    const u = new URL(candidate, base)
    return u.origin === base.origin ? u.toString() : undefined
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(url: URL, init: RequestInit = {}, ms = 8000) {
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
  if (!reader) return (await response.text()).slice(0, maxBytes)
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done || !value) break
    if (total + value.byteLength > maxBytes) {
      const remaining = Math.max(0, maxBytes - total)
      if (remaining) chunks.push(value.subarray(0, remaining))
      await reader.cancel()
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  return Buffer.concat(chunks).toString("utf8")
}

function extractScriptUrls(html: string, base: URL) {
  return unique(Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), (m) => sameOrigin(base, m[1])).filter((x): x is string => Boolean(x)), 80)
}

function extract(text: string) {
  const endpoints = unique([
    ...Array.from(text.matchAll(/\bfetch\(\s*["'`]([^"'`]+)["'`]/g), (m) => m[1]),
    ...Array.from(text.matchAll(/\baxios\.(?:get|post|put|patch|delete|request)\(\s*["'`]([^"'`]+)["'`]/g), (m) => m[1]),
    ...Array.from(text.matchAll(/\.open\(\s*["'`](GET|POST|PUT|PATCH|DELETE|OPTIONS)["'`]\s*,\s*["'`]([^"'`]+)/g), (m) => `${m[1]} ${m[2]}`),
    ...Array.from(text.matchAll(/(?:api|baseURL|baseUrl|endpoint|url)\s*[:=]\s*["'`]([^"'`]{1,180})["'`]/gi), (m) => m[1]),
  ], 180)
  const routes = unique(Array.from(text.matchAll(/["'`]((?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+){1,12}(?:\?[A-Za-z0-9_.~!$&'()*+,;=:@%/?-]*)?)["'`]/g), (m) => m[1]), 220)
  const graphql = unique([
    ...Array.from(text.matchAll(/\b(query|mutation|subscription)\s+([A-Za-z0-9_]+)/g), (m) => `${m[1]} ${m[2]}`),
    ...Array.from(text.matchAll(/operationName["']?\s*[:=]\s*["']([A-Za-z0-9_]+)/g), (m) => `operation ${m[1]}`),
    /graphql/i.test(text) ? "graphql literal present" : "",
  ], 80)
  const params = unique([
    ...Array.from(text.matchAll(/[?&]([A-Za-z0-9_.-]{2,60})=/g), (m) => m[1]),
    ...Array.from(text.matchAll(/(?:params|data|body|json)\s*[:=]\s*\{([^}]{1,600})\}/g), (m) => m[1]).flatMap((s) => Array.from(s.matchAll(/([A-Za-z_$][A-Za-z0-9_$-]{1,60})\s*:/g), (x) => x[1])),
  ], 160)
  const roles = unique(Array.from(text.matchAll(/\b(admin|owner|moderator|staff|manager|tenant|role|permission|isAdmin|isOwner|premium|vip)\b/gi), (m) => m[0]), 80)
  const storage = unique([
    ...Array.from(text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g), (m) => `${m[1]}:${m[2]}`),
    ...Array.from(text.matchAll(/document\.cookie\s*=\s*["'`]([^"'`;=]+)/g), (m) => `cookie-write:${m[1]}`),
  ], 100)
  const sinks = unique([
    ...["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "Function(", "setTimeout(", "dangerouslySetInnerHTML", "v-html", "postMessage", "new WebSocket", "EventSource"].filter((x) => text.includes(x)),
  ], 80)
  const sourceMaps = unique(Array.from(text.matchAll(/sourceMappingURL=([^\s*]+)/g), (m) => m[1]), 50)
  const keywords = unique(Array.from(text.matchAll(/\b(upload|download|export|import|preview|render|template|report|callback|webhook|redirect|next|return|debug|flag|admin|graphql|swagger|openapi)\b/gi), (m) => m[0].toLowerCase()), 80)
  return { endpoints, routes, graphql, params, roles, storage, sinks, sourceMaps, keywords }
}

export default tool({
  description: "CTF Web JS surface map: katana/hakrawler-inspired static extraction from same-origin JavaScript bundles for endpoints, routes, params, GraphQL operations, storage, DOM sinks, roles, source maps, and high-value workflow keywords.",
  args: {
    url: tool.schema.string().describe("Authorized CTF page URL or JS URL."),
    headersJson: tool.schema.string().optional().describe("Optional JSON headers."),
    cookie: tool.schema.string().optional().describe("Optional Cookie header."),
    maxScripts: tool.schema.number().optional().describe("Max same-origin scripts to fetch from HTML. Default 18, hard cap 40."),
    maxBytesPerScript: tool.schema.number().optional().describe("Max bytes per script. Default 900000, hard cap 2000000."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const maxScripts = Math.max(0, Math.min(args.maxScripts ?? 18, 40))
    const maxBytes = Math.max(50000, Math.min(args.maxBytesPerScript ?? 900000, 2000000))
    const scripts: string[] = []
    const fetched: string[] = []
    const errors: string[] = []
    const texts: string[] = []
    try {
      const r = await fetchWithTimeout(base, { headers })
      const body = await readTextCapped(r, maxBytes)
      if (/javascript|ecmascript/i.test(r.headers.get("content-type") ?? "") || base.pathname.endsWith(".js")) {
        texts.push(body)
        fetched.push(base.toString())
      } else {
        scripts.push(...extractScriptUrls(body, base))
        texts.push(body)
      }
    } catch (err) {
      errors.push(`${base}: ${err}`)
    }
    for (const script of unique(scripts, maxScripts)) {
      try {
        const u = new URL(script)
        const r = await fetchWithTimeout(u, { headers })
        texts.push(await readTextCapped(r, maxBytes))
        fetched.push(u.toString())
      } catch (err) {
        errors.push(`${script}: ${err}`)
      }
    }
    const surface = extract(texts.join("\n"))
    const highValue = unique([
      ...surface.routes.filter((x) => /admin|debug|flag|upload|download|export|import|preview|render|report|callback|webhook|graphql|swagger|openapi/i.test(x)),
      ...surface.endpoints.filter((x) => /admin|debug|flag|upload|download|export|import|preview|render|report|callback|webhook|graphql|swagger|openapi/i.test(x)),
    ], 120)
    const next = unique([
      surface.sourceMaps.length ? "fetch source maps and pivot to source-leak audit bridge" : "",
      surface.graphql.length ? "test GraphQL schema/error/introspection with one low-noise probe" : "",
      surface.storage.length || surface.roles.length ? "run state-machine/authz mapping for client-side role/token assumptions" : "",
      surface.sinks.length ? "run reflection-map before XSS/browser payload variants" : "",
      highValue.length ? "rank high_value_routes in ctf-decision-state before fuzzing" : "",
    ])
    return [
      `url: ${base}`,
      `verdict: js_surface_map_v9`,
      `scripts_fetched: ${fetched.length}`,
      "scripts:",
      ...(fetched.length ? fetched.map((x) => `- ${x}`) : ["- none"]),
      `endpoints: ${surface.endpoints.length ? surface.endpoints.join(" | ") : "none"}`,
      `routes: ${surface.routes.length ? surface.routes.join(" | ") : "none"}`,
      `graphql: ${surface.graphql.length ? surface.graphql.join(" | ") : "none"}`,
      `params: ${surface.params.length ? surface.params.join(" | ") : "none"}`,
      `roles_auth_words: ${surface.roles.length ? surface.roles.join(" | ") : "none"}`,
      `storage: ${surface.storage.length ? surface.storage.join(" | ") : "none"}`,
      `dom_runtime_sinks: ${surface.sinks.length ? surface.sinks.join(" | ") : "none"}`,
      `source_maps: ${surface.sourceMaps.length ? surface.sourceMaps.join(" | ") : "none"}`,
      `workflow_keywords: ${surface.keywords.length ? surface.keywords.join(" | ") : "none"}`,
      `high_value_routes: ${highValue.length ? highValue.join(" | ") : "none"}`,
      "recommended_next:",
      ...(next.length ? next.map((x) => `- ${x}`) : ["- feed endpoints/routes into ctf-web-diff-probe or ctf-web-state-machine-map"]),
      "errors:",
      ...(errors.length ? errors.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
