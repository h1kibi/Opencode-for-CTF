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
    for (const [key, value] of Object.entries(parsed))
      if (["string", "number", "boolean"].includes(typeof value)) headers[key] = String(value)
  }
  if (cookie?.trim()) headers.Cookie = cookie.trim()
  return headers
}

async function fetchWithTimeout(url: URL, init: RequestInit = {}, ms = 7000) {
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
    return text.slice(0, maxBytes)
  }
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

function unique(items: string[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function headerLines(response: Response) {
  return Array.from(response.headers.entries()).map(([k, v]) => `${k}: ${v}`)
}

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}

function detect(headers: string[], body: string, faviconHash?: string) {
  const combined = `${headers.join("\n")}\n${body}`
  const appStyle = /__NEXT_DATA__|next\/static|__NUXT__|id=["']root|vite|webpack|<script[^>]+type=["']module/i.test(
    combined,
  )
    ? "spa_or_hybrid"
    : /<form|<a\b|<html/i.test(combined)
      ? "server_rendered_or_simple"
      : "api_or_non_html"
  const framework = unique([
    /__NEXT_DATA__|x-nextjs|next\/static/i.test(combined) ? "Next.js" : "",
    /__NUXT__|nuxt/i.test(combined) ? "Nuxt" : "",
    /react|data-reactroot/i.test(combined) ? "React" : "",
    /vue|v-\w+=|__VUE__/i.test(combined) ? "Vue" : "",
    /angular|ng-app|ng-version/i.test(combined) ? "Angular" : "",
    /express|x-powered-by:\s*express/i.test(combined) ? "Express" : "",
    /django|csrftoken|sessionid/i.test(combined) ? "Django" : "",
    /flask|werkzeug|jinja/i.test(combined) ? "Flask/Jinja" : "",
    /spring|jsessionid|tomcat|actuator/i.test(combined) ? "Java/Spring/Tomcat" : "",
    /php|phpsessid|laravel|symfony|thinkphp|wordpress/i.test(combined) ? "PHP" : "",
  ])
  const apiStyle = unique([
    /\/api\b|fetch\(|axios\.|XMLHttpRequest/i.test(combined) ? "REST/XHR" : "",
    /graphql/i.test(combined) ? "GraphQL" : "",
    /swagger|openapi|redoc/i.test(combined) ? "OpenAPI docs" : "",
    /websocket|new WebSocket|socket\.io/i.test(combined) ? "WebSocket" : "",
  ])
  const auth = unique([
    /eyJ[A-Za-z0-9_-]+\.|jwt|bearer|authorization/i.test(combined) ? "JWT/Bearer" : "",
    /session|sid=|connect\.sid|phpsessid|jsessionid|csrftoken|csrf|xsrf/i.test(combined) ? "Cookie session/CSRF" : "",
    /oauth|oidc|saml|redirect_uri|state=/i.test(combined) ? "OAuth/OIDC/SAML" : "",
  ])
  const infra = unique([
    /cloudflare|cf-cache-status|cf-ray/i.test(combined) ? "Cloudflare" : "",
    /x-cache|varnish|age:|via:/i.test(combined) ? "Cache/proxy" : "",
    /nginx/i.test(combined) ? "nginx" : "",
    /apache/i.test(combined) ? "Apache" : "",
    faviconHash ? `favicon_sha256_16=${faviconHash}` : "",
  ])
  const highValue = unique(
    [
      /upload|multipart|type=["']file/i.test(combined) ? "upload/import/file-write" : "",
      /report|admin.?bot|bot|preview|share|headless|puppeteer|selenium|phantomjs/i.test(combined)
        ? "admin-bot/browser"
        : "",
      /debug|traceback|stack trace|sourceMappingURL|\.map|actuator|\.git|\.env/i.test(combined)
        ? "debug/source leak"
        : "",
      /download|export|file=|path=|render|template|preview/i.test(combined) ? "file-read/render/template" : "",
      /redirect|next=|return=|url=|callback|webhook/i.test(combined) ? "URL parser/redirect/SSRF-adjacent" : "",
      /admin|manage|dashboard|role|tenant|owner/i.test(combined) ? "authz/state-machine" : "",
    ],
    40,
  )
  return { appStyle, framework, apiStyle, auth, infra, highValue }
}

export default tool({
  description:
    "CTF Web fingerprint: httpx-inspired low-cost target profile for authorized black-box Web challenges. Produces app/API/auth/infra style, high-value surfaces, and next-tool routing.",
  args: {
    url: tool.schema.string().describe("Authorized CTF URL."),
    headersJson: tool.schema.string().optional().describe("Optional JSON object of headers."),
    cookie: tool.schema.string().optional().describe("Optional Cookie header."),
    fetchFavicon: tool.schema.boolean().optional().describe("Fetch /favicon.ico for a compact hash. Default true."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const response = await fetchWithTimeout(base, { headers })
    const body = await readTextCapped(response, 700000)
    const h = headerLines(response)
    let faviconHash = ""
    if (args.fetchFavicon ?? true) {
      try {
        const fav = new URL("/favicon.ico", base)
        const r = await fetchWithTimeout(fav, { headers })
        const ab = await r.arrayBuffer()
        if (ab.byteLength) faviconHash = hash(Buffer.from(ab).toString("binary"))
      } catch {}
    }
    const d = detect(h, body, faviconHash)
    const next = unique([
      d.appStyle === "spa_or_hybrid" ? "ctf-web-js-surface-map then ctf-web-runtime-map" : "",
      d.apiStyle.length ? "ctf-web-diff-probe on one high-value API route" : "",
      d.highValue.some((x) => /authz|state/.test(x))
        ? "ctf-web-state-machine-map and ctf-web-authz-matrix when accounts/IDs exist"
        : "",
      d.highValue.some((x) => /upload|bot|render|redirect/.test(x))
        ? "ctf-web-template-check with matched families before payload variants"
        : "",
      d.highValue.some((x) => /source leak|debug/.test(x)) ? "fetch leak/source-map artifacts before fuzzing" : "",
      "feed profile and high-value surfaces into ctf-decision-state rank",
    ])
    return [
      `url: ${base}`,
      `verdict: web_fingerprint_v9`,
      `status: ${response.status}`,
      `body_hash: ${hash(body)}`,
      `app_style: ${d.appStyle}`,
      `framework_hints: ${d.framework.length ? d.framework.join(" | ") : "none"}`,
      `api_style: ${d.apiStyle.length ? d.apiStyle.join(" | ") : "none"}`,
      `auth_hints: ${d.auth.length ? d.auth.join(" | ") : "none"}`,
      `infra_hints: ${d.infra.length ? d.infra.join(" | ") : "none"}`,
      `high_value_surfaces: ${d.highValue.length ? d.highValue.join(" | ") : "none"}`,
      "headers:",
      ...h.map((x) => `- ${x}`),
      "recommended_next:",
      ...next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
