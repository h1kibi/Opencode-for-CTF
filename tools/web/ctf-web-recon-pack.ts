import { tool } from "@opencode-ai/plugin"
import { fetchWithTimeout, normalizeUrl, readTextCapped, unique } from "../lib/web-http.ts"
import { extractFlagCandidates, FLAG_REGEX_ONCE } from "../../packages/ctf-core/src/flag-rules.ts"

type Finding = { label: string; evidence: string; next: string; score: number }

function uniq(items: string[], limit = 80) {
  return unique(items, limit)
}

async function fetchText(url: URL, ms: number, maxBytes: number) {
  const response = await fetchWithTimeout(url, {}, ms)
  const body = await readTextCapped(response, maxBytes)
  return {
    status: response.status,
    headers: Array.from(response.headers.entries()).map(([k, v]) => `${k}: ${v}`),
    text: body.text,
    truncated: body.truncated,
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
  add("flag candidate content", FLAG_REGEX_ONCE, "send candidate to ctf-evidence-board (command=flag-verify); do not treat HTTP text as success", 100)
  add(
    "Java/Spring/Tomcat surface",
    /spring|jsessionid|actuator|tomcat|jetty|shiro|struts|whitelabel/i,
    "run ctf-java-analyze or Java control-plane checks",
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
    const flagCandidates = extractFlagCandidates(page.text, {
      source: base.toString(),
      origin: "http-response",
      text: page.text,
    }).map((candidate) => ({
      ...candidate,
      source: base.toString(),
      origin: "http-response",
      context: page.text.slice(0, 240),
    }))
    const nextTool = flagCandidates.length
      ? "ctf-evidence-board (command=flag-verify)"
      : findings[0]?.label.includes("Java")
        ? "ctf-java-analyze"
        : findings.length
          ? "ctf-decision-state"
          : "ctf-web-blackbox-map"
    return [
      "# CTF Web Recon Pack",
      "schema_version: web_recon_pack.v2",
      `url: ${base.toString()}`,
      `mode: ${mode}`,
      `status: ${page.status}${page.truncated ? " truncated" : ""}`,
      `verdict: ${flagCandidates.length ? "flag_candidate" : "web_recon"}`,
      `direct_solve: no`,
      `candidate_status: ${flagCandidates.length ? "pending_oracle" : "none"}`,
      "oracle_verified: false",
      `routes_found: ${routeList.length}`,
      `scripts_found: ${scriptList.length}`,
      `next_tool: ${nextTool}`,
      "flag_candidates:",
      ...(flagCandidates.length
        ? flagCandidates.map(
            (candidate) =>
              `- value=${candidate.value} confidence=${candidate.confidence} kind=${candidate.kind} reason=${candidate.reason} source=${candidate.source} origin=${candidate.origin} context=${candidate.context}`,
          )
        : ["- none"]),
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
      "- If a flag-shaped response appears, enter candidate verification; HTTP content alone is not a success oracle.",
      "- A config/source path is evidence only; preserve source, origin, context, and verify independently.",
    ].join("\n")
  },
})
