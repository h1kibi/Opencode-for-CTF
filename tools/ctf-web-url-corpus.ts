import { tool } from "@opencode-ai/plugin"

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^[A-Za-z0-9.-]+:\d+(?:\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

function unique(items: string[], limit = 200) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

function patternize(path: string) {
  return path
    .replace(/\b\d+\b/g, "{num}")
    .replace(/[A-Fa-f0-9]{16,}/g, "{hex}")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{uuid}")
}

export default tool({
  description:
    "CTF Web URL corpus: gau/waybackurls/ParamSpider-inspired normalizer for live, JS, archived, or pasted URLs. Deduplicates route patterns, mines parameters, and ranks high-value black-box endpoints. It does not fetch archives itself.",
  args: {
    baseUrl: tool.schema.string().describe("Authorized base URL/domain."),
    urls: tool.schema
      .string()
      .describe("Newline/comma-separated URLs or paths from crawl, JS, gau, waybackurls, ParamSpider, logs, or notes."),
    includeOffOrigin: tool.schema.boolean().optional().describe("Keep off-origin URLs as references. Default false."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.baseUrl))
    const raw = args.urls
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
    const normalized: string[] = []
    const offOrigin: string[] = []
    const params: string[] = []
    for (const item of raw) {
      try {
        const u = new URL(item, base)
        if (u.origin !== base.origin) {
          if (args.includeOffOrigin) offOrigin.push(u.toString())
          continue
        }
        normalized.push(`${u.pathname}${u.search}`)
        for (const key of u.searchParams.keys()) params.push(key)
      } catch {}
    }
    const routes = unique(
      normalized.map((x) => x.split("?")[0]),
      300,
    )
    const patterns = unique(routes.map(patternize), 220)
    const highValue = unique(
      normalized.filter((x) =>
        /admin|api|debug|flag|graphql|swagger|openapi|upload|download|export|import|preview|render|report|bot|callback|webhook|redirect|next|return|file|path|template|search|user|profile|order|pay|checkout|coupon|reset|token/i.test(
          x,
        ),
      ),
      160,
    )
    const paramNames = unique(params, 200)
    const paramFamilies = unique(
      [
        ...paramNames
          .filter((x) => /url|uri|next|return|redirect|callback|webhook|host|domain/i.test(x))
          .map((x) => `${x}: url-parser/redirect/SSRF`),
        ...paramNames
          .filter((x) => /file|path|dir|template|page|view|render|download/i.test(x))
          .map((x) => `${x}: file/render/LFI`),
        ...paramNames
          .filter((x) => /id|uid|user|account|tenant|team|order|post|file/i.test(x))
          .map((x) => `${x}: IDOR/object`),
        ...paramNames.filter((x) => /q|query|search|filter|sort|where/i.test(x)).map((x) => `${x}: query/parser`),
        ...paramNames
          .filter((x) => /debug|test|dev|admin|role|token|jwt|key/i.test(x))
          .map((x) => `${x}: auth/debug/control`),
      ],
      160,
    )
    const next = unique([
      highValue.length ? "rank high_value_urls before broad fuzzing" : "",
      paramFamilies.length ? "run ctf-web-diff-probe on one parameter family at a time" : "",
      paramNames.length ? "use ctf-web-reflection-map for reflected candidate params" : "",
      patterns.length ? "feed route_patterns into ctf-web-fuzz-plan as seed/evidence" : "",
    ])
    return [
      `base: ${base.origin}`,
      `verdict: url_corpus_v9`,
      `input_urls: ${raw.length}`,
      `same_origin_urls: ${normalized.length}`,
      `off_origin_kept: ${offOrigin.length}`,
      `route_patterns: ${patterns.length ? patterns.join(" | ") : "none"}`,
      `parameters: ${paramNames.length ? paramNames.join(" | ") : "none"}`,
      "parameter_families:",
      ...(paramFamilies.length ? paramFamilies.map((x) => `- ${x}`) : ["- none"]),
      "high_value_urls:",
      ...(highValue.length ? highValue.map((x) => `- ${x}`) : ["- none"]),
      "off_origin_references:",
      ...(offOrigin.length ? offOrigin.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...(next.length
        ? next.map((x) => `- ${x}`)
        : ["- use ctf-web-blackbox-map or ctf-web-js-surface-map to collect a richer corpus"]),
    ].join("\n")
  },
})
