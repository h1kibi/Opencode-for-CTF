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

function unique<T>(items: T[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function safeMode(mode?: string) {
  const m = (mode || "light").trim().toLowerCase()
  if (["light", "browser", "deep"].includes(m)) return m
  return "light"
}

function sameOrigin(base: URL, candidate: string) {
  try {
    const u = new URL(candidate, base)
    return u.origin === base.origin ? u : undefined
  } catch {
    return undefined
  }
}

function attrValue(attrs: string, name: string) {
  return attrs.match(new RegExp(`${name}=["']?([^"'\\s>]+)`, "i"))?.[1]
}

function extractForms(text: string, base: URL) {
  return Array.from(text.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi), (m) => {
    const attrs = m[1]
    const body = m[2]
    const method = (attrValue(attrs, "method") ?? "GET").toUpperCase()
    const actionRaw = attrValue(attrs, "action") ?? base.pathname
    const action = sameOrigin(base, actionRaw)?.pathname ?? actionRaw
    const inputs = unique(Array.from(body.matchAll(/(?:name|id)=["']([^"']+)/gi), (x) => x[1]), 30)
    const buttons = unique(Array.from(body.matchAll(/<button\b[\s\S]*?(?:name|id)=["']([^"']+)/gi), (x) => x[1]), 10)
    const hasFile = /type=["']?file/i.test(body)
    return `${method} ${action} inputs=[${inputs.join(",") || "none"}] buttons=[${buttons.join(",") || "none"}]${hasFile ? " file_input=yes" : ""}`
  }).slice(0, 50)
}

function extractLinks(text: string, base: URL) {
  const hrefs = Array.from(text.matchAll(/(?:href|src|action)=["']([^"'#]+)/gi), (m) => sameOrigin(base, m[1])?.pathname).filter((x): x is string => Boolean(x))
  const rawRoutes = Array.from(text.matchAll(/["'`]((?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+){1,10}(?:\?[A-Za-z0-9_.~!$&'()*+,;=:@%/?-]*)?)["'`]/g), (m) => m[1])
  return unique([...hrefs, ...rawRoutes].filter((x) => x.startsWith("/")), 160)
}

function extractScripts(text: string, base: URL) {
  return unique(Array.from(text.matchAll(/src=["']([^"']+\.js[^"']*)/gi), (m) => sameOrigin(base, m[1])?.toString()).filter((x): x is string => Boolean(x)), 40)
}

function routeHints(text: string) {
  const hits = Array.from(text.matchAll(/\/(?:api|admin|debug|dev|flag|graphql|internal|upload|file|download|preview|render|bot|report|login|logout|register|reset|profile|user|users|search|export|import|webhook|callback|oauth|saml|actuator)[A-Za-z0-9_./?=&%:-]*/gi), (m) => m[0])
  return unique(hits.map((x) => x.slice(0, 180)), 140)
}

function extractFetchTargets(text: string) {
  const hits = [
    ...Array.from(text.matchAll(/\bfetch\(\s*["'`]([^"'`]+)["'`]/g), (m) => m[1]),
    ...Array.from(text.matchAll(/\baxios\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g), (m) => m[1]),
    ...Array.from(text.matchAll(/\bXMLHttpRequest\b|\.open\(\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`]([^"'`]+)/g), (m) => m[2] ?? m[0]),
  ]
  return unique(hits.map((x) => x.slice(0, 180)), 100)
}

function extractStorageKeys(text: string) {
  const hits = Array.from(text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g), (m) => `${m[1]}:${m[2]}`)
  const direct = Array.from(text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*([A-Za-z0-9_$-]{2,80})/g), (m) => `${m[1]}:${m[2]}`)
  return unique([...hits, ...direct], 80)
}

function extractDomSinks(text: string) {
  const sinks = [
    "innerHTML",
    "outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "eval(",
    "Function(",
    "setTimeout(",
    "setInterval(",
    "location.hash",
    "location.search",
    "URLSearchParams",
    "dangerouslySetInnerHTML",
    "v-html",
  ]
  return sinks.filter((s) => text.includes(s)).slice(0, 40)
}

function extractPostMessage(text: string) {
  const hits: string[] = []
  if (/addEventListener\s*\(\s*["']message["']/.test(text)) hits.push("message listener")
  if (/postMessage\s*\(/.test(text)) hits.push("postMessage sender")
  if (/event\.origin|e\.origin|origin\s*===/.test(text)) hits.push("origin check present")
  if (/origin\s*!==|origin\s*!=/.test(text)) hits.push("negative origin check")
  if (/\*\s*\)/.test(text) && /postMessage/.test(text)) hits.push("wildcard targetOrigin candidate")
  return unique(hits, 20)
}

function extractServiceWorkers(text: string) {
  return unique(Array.from(text.matchAll(/serviceWorker\.register\s*\(\s*["'`]([^"'`]+)/g), (m) => m[1]), 20)
}

function cookieIssues(cookie: string) {
  const issues: string[] = []
  if (!/httponly/i.test(cookie)) issues.push("missing HttpOnly")
  if (!/samesite/i.test(cookie)) issues.push("missing SameSite")
  if (!/secure/i.test(cookie)) issues.push("missing Secure")
  return issues.length ? `${cookie.split(";")[0]} (${issues.join(", ")})` : ""
}

function findTech(headersText: string, text: string) {
  const combined = `${headersText}\n${text}`
  const frameworkHints: string[] = []
  const frontendHints: string[] = []
  const authHints: string[] = []
  const proxyCacheHints: string[] = []
  const server = unique(Array.from(headersText.matchAll(/(?:^|\n).*?(?:server|x-powered-by|x-runtime|x-generator|via|x-cache|cf-cache-status|x-vercel|x-nextjs-cache).*?:\s*([^\n]+)/gi), (m) => m[0].trim()), 30)

  const techPatterns: Array<[string, RegExp, string[]]> = [
    ["Spring/Java", /spring|jsessionid|x-application-context|actuator|shiro|struts|tomcat|jetty/i, frameworkHints],
    ["PHP", /php|phpsessid|laravel|symfony|thinkphp|wordpress|yii|codeigniter/i, frameworkHints],
    ["Python", /django|flask|werkzeug|fastapi|starlette|jinja/i, frameworkHints],
    ["Node/Express", /express|next\.js|nuxt|node|koa|nestjs|fastify/i, frameworkHints],
    ["Rails/Rack", /rails|rack|ruby/i, frameworkHints],
    ["React/Next", /__NEXT_DATA__|react|next\/static|data-reactroot/i, frontendHints],
    ["Vue/Nuxt", /vue|nuxt|__NUXT__/i, frontendHints],
    ["Angular", /ng-app|ng-controller|angular\.js|angular\.min\.js/i, frontendHints],
    ["Svelte/Vite/Webpack", /svelte|vite|webpack|parcel/i, frontendHints],
    ["JWT/OAuth/SAML", /eyJ[A-Za-z0-9_-]+\.|jwt|bearer|oauth|oidc|saml|redirect_uri|state=/i, authHints],
    ["CSRF/session", /csrf|xsrf|session|remember_me|sameSite/i, authHints],
    ["Proxy/CDN/cache", /cloudflare|akamai|varnish|nginx|envoy|traefik|x-cache|cf-cache-status|via:/i, proxyCacheHints],
  ]
  for (const [label, re, bucket] of techPatterns) if (re.test(combined)) bucket.push(label)
  return { server, frameworkHints: unique(frameworkHints), frontendHints: unique(frontendHints), authHints: unique(authHints), proxyCacheHints: unique(proxyCacheHints) }
}

function classifySurface(allText: string, headersText: string, forms: string[], routes: string[], runtime: { fetchTargets: string[]; domSinks: string[]; postMessage: string[]; storageKeys: string[]; serviceWorkers: string[] }) {
  const combined = `${allText}\n${headersText}\n${forms.join("\n")}\n${routes.join("\n")}\n${runtime.fetchTargets.join("\n")}`
  const candidates: string[] = []
  const queue: string[] = []
  const browserNeeds: string[] = []
  const add = (candidate: string, seed: string) => {
    candidates.push(candidate)
    queue.push(seed)
  }
  if (/graphql/i.test(combined) || routes.some((x) => /graphql/i.test(x))) add("GraphQL endpoint", "graphql schema/error/GET-CSRF calibration | V=4 C=2 IG=4 R=1 SD=0 S=4")
  if (/swagger|openapi|api-doc|redoc/i.test(combined)) add("API documentation leak", "OpenAPI/Swagger route expansion before fuzzing | V=4 C=1 IG=4 R=1 SD=0 S=5")
  if (/upload|multipart|file_input=yes/i.test(combined)) add("upload surface", "upload validation/storage harmless canary | V=4 C=2 IG=3 R=3 SD=2 S=3")
  if (/admin.?bot|report|bot|xss|phantomjs|selenium|puppeteer|headless|share|preview/i.test(combined)) {
    add("admin bot / browser runtime surface", "one harmless bot/runtime fingerprint before payload | V=5 C=3 IG=4 R=4 SD=2 S=2")
    browserNeeds.push("admin bot/runtime differences")
  }
  if (/debug|traceback|stack trace|werkzeug|express error|django|flask debug|__debugger__|actuator/i.test(combined)) add("debug/source/config leak surface", "debug/source/config disclosure fetch | V=4 C=1 IG=4 R=1 SD=0 S=5")
  if (/login|register|session|csrf|xsrf|jwt|eyJ[A-Za-z0-9_-]+\.|oauth|saml/i.test(combined)) add("auth/session/token surface", "auth/session/CSRF differential map | V=4 C=2 IG=4 R=1 SD=0 S=4")
  if (/redirect_uri|redirect=|return=|next=|url=|callback=|webhook/i.test(combined)) add("URL parser / redirect / SSRF-adjacent surface", "safe URL parser differential with allowlisted benign target | V=4 C=2 IG=4 R=2 SD=0 S=3")
  if (/search|query|sqlite|mysql|postgres|sql|mongo|where\[|\$ne|\$regex/i.test(combined)) add("query/parser injection surface", "one-variable parser/oracle calibration | V=3 C=2 IG=3 R=1 SD=0 S=3")
  if (/download|file|path|template|render|preview|export/i.test(combined)) add("file/read/render surface", "path/template/render canary differential | V=4 C=2 IG=3 R=2 SD=0 S=3")
  if (runtime.domSinks.length || runtime.postMessage.length || /<script|data-reactroot|id=["']root|__NEXT_DATA__|vite|webpack|nuxt|vue|angular/i.test(combined)) browserNeeds.push("SPA/DOM/network route discovery")
  if (runtime.fetchTargets.length) browserNeeds.push("XHR/fetch endpoint expansion")
  if (runtime.serviceWorkers.length) browserNeeds.push("service worker/cache behavior")
  return { candidates: unique(candidates, 60), queue: unique(queue, 80), browserNeeds: unique(browserNeeds, 30) }
}

export default tool({
  description: "CTF Web black-box map v8: safe low-volume discovery for URL-only web challenges. Builds tech fingerprint, surface map, static browser-runtime signals, state model, and a ranked attack queue seed without payload spraying.",
  args: {
    url: tool.schema.string().describe("Authorized CTF URL. http:// is auto-added for localhost/host:port."),
    mode: tool.schema.string().optional().describe("light | browser | deep. Default light. browser/deep fetch more same-origin JS and model runtime/state signals."),
    headersJson: tool.schema.string().optional().describe("Optional JSON object of request headers"),
    cookie: tool.schema.string().optional().describe("Optional Cookie header value"),
    maxRequests: tool.schema.number().optional().describe("Maximum safe discovery requests. Default depends on mode; hard cap 40."),
    maxScripts: tool.schema.number().optional().describe("Maximum same-origin JS files to inspect. Default depends on mode; hard cap 20."),
    extraPaths: tool.schema.string().optional().describe("Optional newline/comma-separated same-origin paths to include in the safe discovery budget."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const mode = safeMode(args.mode)
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const defaultRequests = mode === "light" ? 14 : mode === "browser" ? 22 : 32
    const defaultScripts = mode === "light" ? 5 : mode === "browser" ? 10 : 16
    const maxRequests = Math.max(4, Math.min(args.maxRequests ?? defaultRequests, 40))
    const maxScripts = Math.max(0, Math.min(args.maxScripts ?? defaultScripts, 20))
    const safePaths = [
      base.pathname || "/",
      "/robots.txt",
      "/sitemap.xml",
      "/.well-known/security.txt",
      "/api",
      "/api/",
      "/graphql",
      "/openapi.json",
      "/swagger.json",
      "/swagger-ui/",
      "/admin",
      "/login",
      "/logout",
      "/register",
      "/reset",
      "/upload",
      "/report",
      "/preview",
      "/debug",
      "/actuator",
      "/.git/HEAD",
      "/.env",
    ]
    if (args.extraPaths?.trim()) safePaths.push(...args.extraPaths.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))

    const requested: string[] = []
    const pages: string[] = []
    const forms: string[] = []
    const links: string[] = []
    const scripts: string[] = []
    const headersLines: string[] = []
    const cookies: string[] = []
    const errors: string[] = []
    const statusMap: string[] = []

    for (const p of unique(safePaths, maxRequests)) {
      const u = new URL(p, base)
      if (u.origin !== base.origin) continue
      requested.push(u.pathname)
      try {
        const r = await fetchWithTimeout(u, { headers })
        const h = Array.from(r.headers.entries()).map(([k, v]) => `${k}: ${v}`)
        headersLines.push(...h.map((x) => `${u.pathname}: ${x}`))
        cookies.push(...h.filter((x) => /^set-cookie:/i.test(x)).map((x) => x.replace(/^set-cookie:\s*/i, "")))
        const body = await readTextCapped(r, 500000)
        const ct = r.headers.get("content-type") ?? ""
        statusMap.push(`${u.pathname}: ${r.status} ${ct}${body.truncated ? " truncated" : ""}`)
        if (/text|json|javascript|xml|html/i.test(ct) || body.text.trim()) {
          pages.push(`${u.pathname}\n${body.text}`)
          forms.push(...extractForms(body.text, u))
          links.push(...extractLinks(body.text, u))
          scripts.push(...extractScripts(body.text, u))
        }
      } catch (err) {
        errors.push(`${u.pathname}: ${err}`)
      }
    }

    const jsFindings: string[] = []
    const discoveredRoutes: string[] = []
    const jsTexts: string[] = []
    for (const script of unique(scripts, maxScripts)) {
      try {
        const u = new URL(script)
        const r = await fetchWithTimeout(u, { headers })
        const body = await readTextCapped(r, mode === "deep" ? 800000 : 400000)
        const text = body.text
        jsTexts.push(`${u.pathname}\n${text}`)
        jsFindings.push(`${u.pathname}: status=${r.status}${body.truncated ? " truncated" : ""}`)
        const hints = routeHints(text)
        if (hints.length) jsFindings.push(...hints.slice(0, 35).map((x) => `${u.pathname}: route_hint ${x}`))
        const maps = Array.from(text.matchAll(/sourceMappingURL=([^\s*]+)/g), (m) => m[1])
        if (maps.length) jsFindings.push(...maps.slice(0, 8).map((x) => `${u.pathname}: source_map_hint ${x}`))
        if (/[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/.test(text)) jsFindings.push(`${u.pathname}: flag_like_js yes`)
        discoveredRoutes.push(...hints)
      } catch (err) {
        jsFindings.push(`${script}: fetch failed: ${err}`)
      }
    }

    const allText = `${pages.join("\n")}\n${jsTexts.join("\n")}`
    const allRoutes = unique([...links, ...discoveredRoutes, ...routeHints(allText)], 180)
    const headersText = headersLines.join("\n")
    const runtime = {
      fetchTargets: extractFetchTargets(allText),
      storageKeys: extractStorageKeys(allText),
      cookies: unique(cookies.map(cookieIssues).filter(Boolean), 40),
      csp: unique(headersLines.filter((x) => /content-security-policy/i.test(x)).map((x) => x.slice(0, 220)), 20),
      domSinks: extractDomSinks(allText),
      postMessage: extractPostMessage(allText),
      serviceWorkers: extractServiceWorkers(allText),
    }
    const tech = findTech(headersText, allText)
    const formsUnique = unique(forms, 60)
    const apiCandidates = unique(allRoutes.filter((x) => /\/api|graphql|openapi|swagger|callback|webhook/i.test(x)), 80)
    const adminCandidates = unique(allRoutes.filter((x) => /admin|manage|dashboard|internal|actuator/i.test(x)), 50)
    const uploadCandidates = unique([...formsUnique, ...allRoutes].filter((x) => /upload|import|avatar|file|multipart/i.test(x)), 50)
    const debugCandidates = unique([...allRoutes, ...statusMap, ...jsFindings].filter((x) => /debug|trace|sourceMappingURL|\.map|\.git|\.env|actuator|stack/i.test(x)), 50)
    const authCandidates = unique([...formsUnique, ...allRoutes, ...runtime.fetchTargets].filter((x) => /login|logout|register|reset|session|csrf|xsrf|oauth|saml|jwt|token|profile|user/i.test(x)), 80)
    const stateModel = {
      roles: unique([...allRoutes, ...allText.match(/admin|moderator|user|guest|owner|role|tenant/gi) ?? []].map((x) => String(x).slice(0, 120)), 50),
      loginRegisterReset: unique([...authCandidates].filter((x) => /login|register|reset|logout|session/i.test(x)), 50),
      objectIdPatterns: unique(Array.from(allText.matchAll(/\b(?:id|userId|uid|orderId|postId|fileId|tenantId|teamId)["'\s:=]+([A-Za-z0-9_-]{1,80})/g), (m) => `${m[0].slice(0, 80)}`), 80),
      workflowEdges: unique([...formsUnique, ...runtime.fetchTargets].filter((x) => /create|update|delete|approve|submit|publish|share|report|preview|export|import|checkout|pay/i.test(x)), 80),
    }
    const { candidates, queue, browserNeeds } = classifySurface(allText, headersText, formsUnique, allRoutes, runtime)
    const flagHits = unique(Array.from(allText.matchAll(/[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g), (m) => m[0]), 20)

    const recommendations: string[] = []
    if (flagHits.length) recommendations.push("verify flag-like hit immediately; do not broaden exploration")
    if (jsFindings.some((x) => /source_map_hint/.test(x))) recommendations.push("fetch source maps before fuzzing; then pivot to source-guided audit bridge")
    if (browserNeeds.length || mode !== "light") recommendations.push("run ctf-web-runtime-map or browser MCP for the listed browser-specific need; keep curl as final reproduction when possible")
    if (queue.length) recommendations.push("feed attack_queue_seed into ctf-decision-state rank before focused probes")
    if (apiCandidates.length) recommendations.push("use ctf-web-diff-probe on the most interesting API endpoint; one variable only")
    if (authCandidates.length) recommendations.push("use ctf-web-authz-matrix when two accounts or object IDs are available")
    if (!queue.length) recommendations.push("next cheapest orthogonal checks: compare curl vs browser-rendered DOM, inspect JS-discovered routes, then one-variable oracle probes")

    const verdict = flagHits.length ? "direct_flag" : queue.length ? "blackbox_attack_queue_v8" : "blackbox_recon_v8"
    return [
      `url: ${base}`,
      `mode: ${mode}`,
      `verdict: ${verdict}`,
      `confidence: ${flagHits.length ? "high" : queue.length ? "medium" : "low"}`,
      `requests_used: ${requested.length}/${maxRequests}`,
      `next_tool: ${queue.length ? "ctf-decision-state" : browserNeeds.length ? "ctf-web-runtime-map" : "ctf-web-diff-probe"}`,
      `spawn_subagent: maybe`,
      `direct_solve: ${flagHits.length ? "yes" : "no"}`,
      "tech_fingerprint:",
      `- server_headers: ${tech.server.length ? tech.server.join(" | ") : "none"}`,
      `- framework_hints: ${tech.frameworkHints.length ? tech.frameworkHints.join(", ") : "none"}`,
      `- frontend_hints: ${tech.frontendHints.length ? tech.frontendHints.join(", ") : "none"}`,
      `- auth_hints: ${tech.authHints.length ? tech.authHints.join(", ") : "none"}`,
      `- proxy_cache_hints: ${tech.proxyCacheHints.length ? tech.proxyCacheHints.join(", ") : "none"}`,
      "status_map:",
      ...statusMap.map((x) => `- ${x}`),
      "surface_map:",
      `- routes: ${allRoutes.length ? allRoutes.slice(0, 120).join(" | ") : "none"}`,
      `- forms: ${formsUnique.length ? formsUnique.slice(0, 40).join(" | ") : "none"}`,
      `- api_candidates: ${apiCandidates.length ? apiCandidates.join(" | ") : "none"}`,
      `- admin_candidates: ${adminCandidates.length ? adminCandidates.join(" | ") : "none"}`,
      `- upload_candidates: ${uploadCandidates.length ? uploadCandidates.join(" | ") : "none"}`,
      `- debug_source_candidates: ${debugCandidates.length ? debugCandidates.join(" | ") : "none"}`,
      "browser_runtime_static:",
      `- xhr_fetch: ${runtime.fetchTargets.length ? runtime.fetchTargets.slice(0, 80).join(" | ") : "none"}`,
      `- storage_keys: ${runtime.storageKeys.length ? runtime.storageKeys.join(" | ") : "none"}`,
      `- cookie_findings: ${runtime.cookies.length ? runtime.cookies.join(" | ") : "none"}`,
      `- csp: ${runtime.csp.length ? runtime.csp.join(" | ") : "none"}`,
      `- dom_sinks: ${runtime.domSinks.length ? runtime.domSinks.join(" | ") : "none"}`,
      `- postmessage: ${runtime.postMessage.length ? runtime.postMessage.join(" | ") : "none"}`,
      `- service_workers: ${runtime.serviceWorkers.length ? runtime.serviceWorkers.join(" | ") : "none"}`,
      "state_model:",
      `- roles: ${stateModel.roles.length ? stateModel.roles.join(" | ") : "none"}`,
      `- login_register_reset: ${stateModel.loginRegisterReset.length ? stateModel.loginRegisterReset.join(" | ") : "none"}`,
      `- object_id_patterns: ${stateModel.objectIdPatterns.length ? stateModel.objectIdPatterns.join(" | ") : "none"}`,
      `- workflow_edges: ${stateModel.workflowEdges.length ? stateModel.workflowEdges.join(" | ") : "none"}`,
      "scripts:",
      ...(scripts.length ? unique(scripts, 50).map((x) => `- ${x}`) : ["- none"]),
      "js_findings:",
      ...(jsFindings.length ? jsFindings.slice(0, 140).map((x) => `- ${x}`) : ["- none"]),
      "surface_candidates:",
      ...(candidates.length ? candidates.map((x) => `- ${x}`) : ["- none"]),
      "browser_specific_needs:",
      ...(browserNeeds.length ? browserNeeds.map((x) => `- ${x}`) : ["- none"]),
      "attack_queue_seed:",
      ...(queue.length ? queue.map((x) => `- ${x}`) : ["- none"]),
      "flag_hits:",
      ...(flagHits.length ? flagHits.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...recommendations.map((x) => `- ${x}`),
      "errors:",
      ...(errors.length ? errors.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
