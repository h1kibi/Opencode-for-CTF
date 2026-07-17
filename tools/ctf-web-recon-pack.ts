import { tool } from "@opencode-ai/plugin"

type Finding = { label: string; evidence: string; next: string; score: number }

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^[A-Za-z0-9.-]+:\d+(?:\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

function uniq(items: string[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

async function fetchText(url: URL, ms: number, maxBytes: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal })
    const text = await response.text()
    return {
      status: response.status,
      headers: Array.from(response.headers.entries()).map(([k, v]) => `${k}: ${v}`),
      text: text.slice(0, maxBytes),
      truncated: Buffer.byteLength(text) > maxBytes,
    }
  } finally {
    clearTimeout(timer)
  }
}

function routes(text: string) {
  return uniq(
    Array.from(
      text.matchAll(
        /(?:href|src|action)=["']([^"'#]+)|["'`]((?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+){1,8}(?:\?[A-Za-z0-9_.~!$&'()*+,;=:@%/?-]*)?)["'`]/g,
      ),
      (m) => m[1] || m[2],
    ).filter((x) => x?.startsWith("/")),
    120,
  )
}

function scripts(text: string, base: URL) {
  return uniq(
    Array.from(text.matchAll(/src=["']([^"']+\.js[^"']*)/gi), (m) => {
      try {
        const u = new URL(m[1], base)
        return u.origin === base.origin ? u.pathname : ""
      } catch {
        return ""
      }
    }),
    40,
  )
}

function classify(all: string, headers: string[], routeList: string[]): Finding[] {
  const text = `${headers.join("\n")}\n${all}\n${routeList.join("\n")}`
  const findings: Finding[] = []
  const add = (label: string, re: RegExp, next: string, score: number) => {
    if (re.test(text)) findings.push({ label, evidence: re.source, next, score })
  }
  add(
    "direct flag-like content",
    /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/,
    "verify candidate immediately and stop broad recon",
    100,
  )
  add(
    "Java/Spring/Tomcat surface",
    /spring|jsessionid|actuator|tomcat|jetty|shiro|struts|whitelabel/i,
    "run ctf-java-analyze-pack or Java control-plane checks",
    85,
  )
  add(
    "Swagger/OpenAPI route oracle",
    /swagger|openapi|api-docs|redoc/i,
    "fetch OpenAPI/Swagger variants before route fuzzing",
    80,
  )
  add(
    "debug/source/config leak",
    /debug|traceback|stack trace|sourceMappingURL|\.git|\.env|actuator/i,
    "read source/config candidate with one safe request",
    78,
  )
  add(
    "auth/session workflow",
    /login|logout|register|reset|csrf|xsrf|session|jwt|oauth|saml/i,
    "run state/authz map when accounts or IDs exist",
    68,
  )
  add(
    "upload/file surface",
    /upload|multipart|download|file|export|import|preview|render/i,
    "run focused file/upload canary or differential",
    64,
  )
  add("GraphQL/API surface", /graphql|\/api\b|fetch\(|axios\./i, "map API corpus and run one differential probe", 62)
  add(
    "browser/admin-bot/runtime surface",
    /bot|report|admin.?bot|puppeteer|selenium|postMessage|innerHTML/i,
    "run runtime map; self-test marker before privileged trigger",
    60,
  )
  return findings.sort((a, b) => b.score - a.score).slice(0, 8)
}

export default tool({
  description:
    "CTF Web recon macro pack: one low-volume URL fetch plus static route/runtime classification and focused next-tool routing.",
  args: {
    url: tool.schema.string().describe("Authorized CTF URL. http:// is auto-added for localhost/host:port."),
    mode: tool.schema.string().optional().describe("light | browser | deep. Default light."),
    maxBytes: tool.schema.number().optional().describe("Maximum bytes to read from the landing page. Default 350000."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const mode = (args.mode || "light").toLowerCase()
    const maxBytes = Math.max(50000, Math.min(args.maxBytes ?? 350000, 900000))
    const page = await fetchText(base, mode === "deep" ? 10000 : 7000, maxBytes)
    const routeList = routes(page.text)
    const scriptList = scripts(page.text, base)
    const findings = classify(page.text, page.headers, routeList)
    const nextTool = findings[0]?.label.includes("Java")
      ? "ctf-java-analyze-pack"
      : findings.length
        ? "ctf-decision-state"
        : "ctf-web-blackbox-map"
    return [
      "# CTF Web Recon Pack",
      `url: ${base.toString()}`,
      `mode: ${mode}`,
      `status: ${page.status}${page.truncated ? " truncated" : ""}`,
      `routes_found: ${routeList.length}`,
      `scripts_found: ${scriptList.length}`,
      `next_tool: ${nextTool}`,
      "findings:",
      ...(findings.length
        ? findings.map((f, i) => `- #${i + 1} score=${f.score} ${f.label}; next=${f.next}`)
        : ["- none"]),
      "routes:",
      ...(routeList.length ? routeList.slice(0, 80).map((x) => `- ${x}`) : ["- none"]),
      "scripts:",
      ...(scriptList.length ? scriptList.map((x) => `- ${x}`) : ["- none"]),
      "decision_contract:",
      "- Promote at most three findings into ctf-decision-state.",
      "- Run one focused follow-up, not broad fuzzing.",
      "- If a direct flag/config/source path appears, enter closure immediately.",
    ].join("\n")
  },
})
