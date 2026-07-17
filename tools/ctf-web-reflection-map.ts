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

function normalizeMethod(method?: string) {
  const m = (method || "GET").trim().toUpperCase()
  if (!/^[A-Z]+$/.test(m)) throw new Error(`invalid HTTP method: ${method}`)
  return m
}

function unique(items: string[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function mutateBody(body: string | undefined, parameter: string, value: string) {
  if (!body) return undefined
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    parsed[parameter] = value
    return JSON.stringify(parsed)
  } catch {
    const p = new URLSearchParams(body)
    p.set(parameter, value)
    return p.toString()
  }
}

function classifyContext(text: string, marker: string) {
  const findings: string[] = []
  let idx = text.indexOf(marker)
  while (idx >= 0 && findings.length < 20) {
    const before = text.slice(Math.max(0, idx - 80), idx)
    const after = text.slice(idx + marker.length, idx + marker.length + 80)
    const window = `${before}${marker}${after}`
    let ctx = "text/html_body_or_plain"
    if (/^[^<]*>[^<]*$/.test(before.slice(-30)) && /<\//.test(after)) ctx = "html_text_node"
    if (/=["'][^"']*$/.test(before) || /^[^"']*["']/.test(after)) ctx = "html_attribute"
    if (/<script[\s\S]*$/i.test(before) && !/<\/script>/i.test(before.slice(before.lastIndexOf("<script"))))
      ctx = "script_context"
    if (/^\s*[\[{]/.test(text.trim()) || /application\/json|"[A-Za-z0-9_]+"\s*:/.test(window)) ctx = "json_context"
    if (/^https?:\/\//.test(after) || /location|redirect|href/i.test(window)) ctx = `${ctx}+url_or_redirect_hint`
    findings.push(`${ctx}: ...${window.replace(/\s+/g, " ").slice(0, 180)}...`)
    idx = text.indexOf(marker, idx + marker.length)
  }
  return unique(findings, 20)
}

export default tool({
  description:
    "CTF Web reflection map: Dalfox-inspired low-noise reflected input/context detector. Tests selected query/body/header parameters with harmless markers and reports reflection context, encoding behavior, and follow-up families.",
  args: {
    url: tool.schema.string().describe("Authorized endpoint URL."),
    parameters: tool.schema
      .string()
      .optional()
      .describe(
        "Comma/newline-separated parameter names. Default: existing query parameters plus q/search/name/url/next.",
      ),
    method: tool.schema.string().optional().describe("GET or POST-like method. Default GET."),
    headersJson: tool.schema.string().optional().describe("Optional JSON headers."),
    cookie: tool.schema.string().optional().describe("Optional Cookie header."),
    body: tool.schema.string().optional().describe("Optional baseline body for body parameter reflection."),
    location: tool.schema.string().optional().describe("query | body | header. Default query."),
    maxParameters: tool.schema.number().optional().describe("Maximum parameters to test. Default 8, hard cap 20."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const method = normalizeMethod(args.method)
    const location = (args.location || "query").toLowerCase()
    const defaults = [
      ...base.searchParams.keys(),
      "q",
      "search",
      "name",
      "url",
      "next",
      "redirect",
      "callback",
      "return",
      "message",
      "content",
    ]
    const params = unique(
      [...(args.parameters?.split(/[\n,]/).map((x) => x.trim()) ?? []), ...defaults],
      Math.min(args.maxParameters ?? 8, 20),
    )
    const results: string[] = []
    const families: string[] = []
    for (const param of params) {
      const marker = `ctfREF_${param.replace(/[^A-Za-z0-9]/g, "_")}_9z`
      const url = new URL(base.toString())
      const h = { ...headers }
      let body = args.body
      let m = method
      if (location === "query") url.searchParams.set(param, marker)
      else if (location === "body") {
        if (m === "GET" || m === "HEAD") m = "POST"
        body = mutateBody(args.body || "", param, marker)
        h["Content-Type"] = h["Content-Type"] ?? "application/x-www-form-urlencoded"
      } else if (location === "header") h[param] = marker
      else return `BLOCK: unknown location '${args.location}'`
      const init: RequestInit = { method: m, headers: h }
      if (body && m !== "GET" && m !== "HEAD") init.body = body
      const r = await fetchWithTimeout(url, init)
      const text = await readTextCapped(r, 700000)
      const reflected = text.includes(marker)
      const encoded = text.includes(encodeURIComponent(marker)) || text.includes(marker.replace(/_/g, "%5F"))
      const locationHeader = r.headers.get("location") ?? ""
      const headerReflection = locationHeader.includes(marker)
      const contexts = reflected ? classifyContext(text, marker) : []
      if (reflected || encoded || headerReflection) {
        results.push(
          `${param}: status=${r.status} reflected=${reflected} encoded=${encoded} header_location=${headerReflection} contexts=[${contexts.join(" || ") || "none"}]`,
        )
        if (contexts.some((x) => /script_context|html_attribute|postMessage|url_or_redirect/.test(x)))
          families.push("XSS/DOM/redirect follow-up with CSP/runtime check")
        if (contexts.some((x) => /json_context/.test(x))) families.push("JSON injection / API parser differential")
        if (headerReflection) families.push("open redirect / header-sink differential")
      }
    }
    return [
      `url: ${base}`,
      `verdict: reflection_map_v9`,
      `location: ${location}`,
      `tested_parameters: ${params.join(" | ")}`,
      "reflections:",
      ...(results.length ? results.map((x) => `- ${x}`) : ["- none"]),
      "candidate_families:",
      ...(unique(families).length ? unique(families).map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...(results.length
        ? [
            "- feed reflected parameter/context into ctf-decision-state observe",
            "- run only one context-specific proof before payload variants",
          ]
        : ["- no reflection; deprioritize generic XSS and test parser/state differentials instead"]),
    ].join("\n")
  },
})
