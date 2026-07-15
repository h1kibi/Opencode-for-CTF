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

function unique<T>(items: T[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function sameOrigin(base: URL, candidate: string) {
  try {
    const u = new URL(candidate, base)
    return u.origin === base.origin ? u : undefined
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

function extractScripts(text: string, base: URL) {
  return unique(Array.from(text.matchAll(/src=["']([^"']+\.js[^"']*)/gi), (m) => sameOrigin(base, m[1])?.toString()).filter((x): x is string => Boolean(x)), 40)
}

function extractForms(text: string, base: URL) {
  return Array.from(text.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi), (m) => {
    const attrs = m[1]
    const body = m[2]
    const method = (attrs.match(/method=["']?([^"'\s>]+)/i)?.[1] ?? "GET").toUpperCase()
    const actionRaw = attrs.match(/action=["']?([^"'\s>]+)/i)?.[1] ?? base.pathname
    const action = sameOrigin(base, actionRaw)?.pathname ?? actionRaw
    const inputs = unique(Array.from(body.matchAll(/<(?:input|textarea|select|button)\b[\s\S]*?(?:name|id)=["']([^"']+)/gi), (x) => x[1]), 40)
    return `${method} ${action} inputs=[${inputs.join(",") || "none"}]${/type=["']?file/i.test(body) ? " file_input=yes" : ""}`
  }).slice(0, 60)
}

function extractInteractiveElements(text: string) {
  const buttons = Array.from(text.matchAll(/<(?:button|a|input)\b([^>]{0,500})>/gi), (m) => m[0].replace(/\s+/g, " ").slice(0, 220)).slice(0, 80)
  const ids = Array.from(text.matchAll(/\b(?:id|data-testid|aria-label)=["']([^"']+)/gi), (m) => m[1]).slice(0, 120)
  return { buttons: unique(buttons, 80), ids: unique(ids, 120) }
}

function extractNetwork(text: string) {
  const fetchTargets = [
    ...Array.from(text.matchAll(/\bfetch\(\s*["'`]([^"'`]+)["'`]/g), (m) => `fetch ${m[1]}`),
    ...Array.from(text.matchAll(/\baxios\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g), (m) => `axios.${m[1]} ${m[2]}`),
    ...Array.from(text.matchAll(/\.open\(\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`]([^"'`]+)/g), (m) => `xhr.${m[1]} ${m[2]}`),
    ...Array.from(text.matchAll(/new\s+WebSocket\s*\(\s*["'`]([^"'`]+)/g), (m) => `websocket ${m[1]}`),
    ...Array.from(text.matchAll(/new\s+EventSource\s*\(\s*["'`]([^"'`]+)/g), (m) => `eventsource ${m[1]}`),
  ]
  const routes = Array.from(text.matchAll(/["'`]((?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+){1,10}(?:\?[A-Za-z0-9_.~!$&'()*+,;=:@%/?-]*)?)["'`]/g), (m) => m[1])
  return { fetchTargets: unique(fetchTargets, 140), routes: unique(routes, 180) }
}

function extractStorage(text: string) {
  return unique([
    ...Array.from(text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g), (m) => `${m[1]}:${m[2]}`),
    ...Array.from(text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*([A-Za-z0-9_$-]{2,80})/g), (m) => `${m[1]}:${m[2]}`),
    ...Array.from(text.matchAll(/document\.cookie\s*=\s*["'`]([^"'`;=]+)/g), (m) => `document.cookie-write:${m[1]}`),
  ], 120)
}

function extractSecurityHeaders(headers: string[]) {
  return headers.filter((x) => /content-security-policy|x-frame-options|permissions-policy|referrer-policy|cross-origin|strict-transport-security/i.test(x)).map((x) => x.slice(0, 260))
}

function cookieFindings(headers: string[]) {
  return headers.filter((x) => /^set-cookie:/i.test(x)).map((h) => {
    const cookie = h.replace(/^set-cookie:\s*/i, "")
    const issues: string[] = []
    if (!/httponly/i.test(cookie)) issues.push("missing HttpOnly")
    if (!/samesite/i.test(cookie)) issues.push("missing SameSite")
    if (!/secure/i.test(cookie)) issues.push("missing Secure")
    return `${cookie.split(";")[0]}${issues.length ? ` (${issues.join(", ")})` : ""}`
  })
}

function extractDom(text: string) {
  const sinkTerms = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "Function(", "dangerouslySetInnerHTML", "v-html", "location.hash", "location.search", "URLSearchParams"]
  const sources = ["location.hash", "location.search", "document.referrer", "window.name", "postMessage", "localStorage", "sessionStorage"]
  return {
    sinks: unique(sinkTerms.filter((x) => text.includes(x)), 80),
    sources: unique(sources.filter((x) => text.includes(x)), 80),
    postMessage: unique([
      /addEventListener\s*\(\s*["']message["']/.test(text) ? "message listener" : "",
      /postMessage\s*\(/.test(text) ? "postMessage sender" : "",
      /event\.origin|e\.origin|origin\s*===/.test(text) ? "origin check present" : "",
      /targetOrigin\s*[:=]\s*["']\*["']|postMessage\s*\([\s\S]{0,120}["']\*["']/.test(text) ? "wildcard targetOrigin candidate" : "",
    ], 20),
    serviceWorkers: unique(Array.from(text.matchAll(/serviceWorker\.register\s*\(\s*["'`]([^"'`]+)/g), (m) => m[1]), 30),
  }
}

function adminBotProfile(text: string, headers: string[]) {
  const combined = `${text}\n${headers.join("\n")}`
  const signals = unique([
    ...Array.from(combined.matchAll(/\b(report|admin bot|bot|headless|puppeteer|selenium|phantomjs|share|preview|contact|feedback)\b/gi), (m) => m[0].toLowerCase()),
  ], 40)
  const questions = signals.length
    ? [
        "Does the bot accept a URL, stored content, markdown, or uploaded file?",
        "Does the bot carry an authenticated cookie or privileged local network access?",
        "Are javascript:, data:, blob:, and file: schemes rejected explicitly, not only parsed by new URL()?",
        "Can exfiltration use same-origin storage/upload/export when external network is blocked?",
      ]
    : []
  return { signals, questions }
}

export default tool({
  description: "CTF Web runtime map v8: static/browser-adjacent runtime intelligence from HTML and same-origin JS. Extracts network calls, forms, storage keys, cookie/security headers, DOM sinks, postMessage, service workers, and admin-bot signals without using personal browser history/bookmarks.",
  args: {
    url: tool.schema.string().describe("Authorized CTF URL. http:// is auto-added for localhost/host:port."),
    headersJson: tool.schema.string().optional().describe("Optional JSON request headers"),
    cookie: tool.schema.string().optional().describe("Optional Cookie header"),
    maxScripts: tool.schema.number().optional().describe("Maximum same-origin JS files to inspect. Default 12, hard cap 24."),
    maxBytesPerScript: tool.schema.number().optional().describe("Maximum bytes per script. Default 600000, hard cap 1200000."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const maxScripts = Math.max(0, Math.min(args.maxScripts ?? 12, 24))
    const maxBytes = Math.max(100000, Math.min(args.maxBytesPerScript ?? 600000, 1200000))
    const status: string[] = []
    const headerLines: string[] = []
    const errors: string[] = []
    const texts: string[] = []
    const scripts: string[] = []

    try {
      const r = await fetchWithTimeout(base, { headers })
      const h = Array.from(r.headers.entries()).map(([k, v]) => `${k}: ${v}`)
      headerLines.push(...h)
      const body = await readTextCapped(r, 800000)
      texts.push(body.text)
      status.push(`${base.pathname || "/"}: ${r.status} ${r.headers.get("content-type") ?? ""}${body.truncated ? " truncated" : ""}`)
      scripts.push(...extractScripts(body.text, base))
    } catch (err) {
      errors.push(`${base}: ${err}`)
    }

    for (const script of unique(scripts, maxScripts)) {
      try {
        const u = new URL(script)
        const r = await fetchWithTimeout(u, { headers })
        const body = await readTextCapped(r, maxBytes)
        texts.push(body.text)
        status.push(`${u.pathname}: ${r.status} ${r.headers.get("content-type") ?? ""}${body.truncated ? " truncated" : ""}`)
      } catch (err) {
        errors.push(`${script}: ${err}`)
      }
    }

    const allText = texts.join("\n")
    const network = extractNetwork(allText)
    const forms = extractForms(texts[0] ?? "", base)
    const interactive = extractInteractiveElements(texts[0] ?? "")
    const storage = extractStorage(allText)
    const secHeaders = extractSecurityHeaders(headerLines)
    const cookies = cookieFindings(headerLines)
    const dom = extractDom(allText)
    const bot = adminBotProfile(allText, headerLines)
    const next: string[] = []
    if (network.fetchTargets.length || network.routes.length) next.push("promote high-value XHR/API routes into ctf-decision-state hypotheses")
    if (dom.sinks.length) next.push("test only one reflected/source-to-sink path before XSS payload variants")
    if (bot.signals.length) next.push("build admin bot profile and use one harmless canary before exploit payloads")
    if (storage.length) next.push("check whether tokens/roles are client-side state only or server-verified")
    if (secHeaders.some((x) => /content-security-policy/i.test(x))) next.push("record CSP before choosing exfil/control plane")

    return [
      `url: ${base}`,
      `verdict: runtime_map_v8`,
      `scripts_seen: ${scripts.length}`,
      `scripts_fetched: ${Math.min(unique(scripts).length, maxScripts)}`,
      "status:",
      ...(status.length ? status.map((x) => `- ${x}`) : ["- none"]),
      "network_observations:",
      `- xhr_fetch_ws_eventsource: ${network.fetchTargets.length ? network.fetchTargets.join(" | ") : "none"}`,
      `- route_literals: ${network.routes.length ? network.routes.slice(0, 140).join(" | ") : "none"}`,
      "forms_and_interaction:",
      `- forms: ${forms.length ? forms.join(" | ") : "none"}`,
      `- elements: ${interactive.buttons.length ? interactive.buttons.slice(0, 40).join(" | ") : "none"}`,
      `- ids_labels: ${interactive.ids.length ? interactive.ids.slice(0, 80).join(" | ") : "none"}`,
      "state_and_storage:",
      `- storage_keys: ${storage.length ? storage.join(" | ") : "none"}`,
      `- cookies: ${cookies.length ? cookies.join(" | ") : "none"}`,
      "security_headers:",
      ...(secHeaders.length ? secHeaders.map((x) => `- ${x}`) : ["- none"]),
      "dom_and_browser_surfaces:",
      `- sources: ${dom.sources.length ? dom.sources.join(" | ") : "none"}`,
      `- sinks: ${dom.sinks.length ? dom.sinks.join(" | ") : "none"}`,
      `- postmessage: ${dom.postMessage.length ? dom.postMessage.join(" | ") : "none"}`,
      `- service_workers: ${dom.serviceWorkers.length ? dom.serviceWorkers.join(" | ") : "none"}`,
      "admin_bot_profile:",
      `- signals: ${bot.signals.length ? bot.signals.join(" | ") : "none"}`,
      ...(bot.questions.length ? bot.questions.map((x) => `- question: ${x}`) : ["- question: none"]),
      "recommended_next:",
      ...(next.length ? next.map((x) => `- ${x}`) : ["- run ctf-web-diff-probe on the highest-value endpoint or return to ctf-decision-state rank"]),
      "errors:",
      ...(errors.length ? errors.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
