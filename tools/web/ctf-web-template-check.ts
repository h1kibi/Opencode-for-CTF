import { tool } from "@opencode-ai/plugin"

function unique(items: string[], limit = 100) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

const templates: Record<string, { signals: RegExp[]; checks: string[]; next: string[] }> = {
  "method-override": {
    signals: [/x-http-method-override|_method|method override|put|patch|delete/i],
    checks: [
      "Compare GET/POST/OPTIONS and one X-HTTP-Method-Override value with ctf-web-diff-probe variant=header/method.",
      "Keep URL/body constant; observe status/location/body-shape differential only.",
    ],
    next: ["If state-changing method appears unlocked, model workflow with ctf-web-state-machine-map before mutation."],
  },
  "content-type-confusion": {
    signals: [/json|multipart|form-urlencoded|content-type|parser|body-parser/i],
    checks: [
      "Compare application/json vs x-www-form-urlencoded vs text/plain using identical semantic fields.",
      "Watch for validation bypass, default values, array/object coercion, or auth branch changes.",
    ],
    next: [
      "Feed parser differential into ctf-decision-state observe; do not expand payload family without a new branch.",
    ],
  },
  "path-normalization": {
    signals: [/path|file|download|static|proxy|nginx|apache|spring|express|route/i],
    checks: [
      "Compare /a/b, /a//b, /a/./b, semicolon path params, and encoded slash with ctf-web-diff-probe path_normalization.",
      "Use harmless existing route; do not target system files first.",
    ],
    next: ["If route boundary differs, test one controlled file/render canary before LFI/RCE variants."],
  },
  "host-trust": {
    signals: [/host|x-forwarded-host|forwarded|callback|reset|absolute url|webhook|redirect/i],
    checks: [
      "Compare Host, X-Forwarded-Host, X-Forwarded-Proto, Forwarded, X-Original-URL, and X-Rewrite-URL one at a time.",
      "Look for link generation, password-reset, SSRF, cache, or routing differential.",
    ],
    next: ["If reflected in links/Location, run reflection-map/header or URL parser differential."],
  },
  "cache-key": {
    signals: [/cache|cdn|varnish|x-cache|cf-cache-status|age:|etag|vary/i],
    checks: [
      "Compare cache-buster query/header, Accept-Encoding, Host, Cookie presence, and normalized paths.",
      "Record cache hit/miss and body hash; avoid poisoning until key behavior is clear.",
    ],
    next: ["If key mismatch appears, rank cache-deception/poisoning as a separate hypothesis with state-damage risk."],
  },
  graphql: {
    signals: [/graphql|operationName|query\s+\w+|mutation\s+\w+/i],
    checks: [
      "Check GET vs POST, content-type errors, introspection disabled/enabled, operationName handling, and batching with harmless queries.",
      "Prefer schema/error oracle before auth bypass attempts.",
    ],
    next: ["If GraphQL ops are in JS, map operation names with ctf-web-js-surface-map first."],
  },
  "jwt-shape": {
    signals: [/jwt|bearer|authorization|eyJ[A-Za-z0-9_-]+\./i],
    checks: [
      "Classify token location, alg/kid/jku/x5u/header fields when token is provided by user.",
      "Do not brute secrets; first test auth-state differential and client-side role assumptions.",
    ],
    next: ["Use ctf-web-state-machine-map for role/tenant flow and JWT skill only after token shape evidence."],
  },
  "upload-storage": {
    signals: [/upload|multipart|avatar|import|file_input|filename|content-type/i],
    checks: [
      "Build storage/serve/reload matrix; upload only harmless canary content first.",
      "Compare extension, MIME, magic bytes, archive extraction, and served path separately.",
    ],
    next: ["Use ctf-file-write-matrix before overwrite/execution assumptions."],
  },
  "admin-bot-runtime": {
    signals: [/report|bot|admin.?bot|preview|share|headless|puppeteer|selenium|phantomjs|csp|postmessage/i],
    checks: [
      "Build runtime profile: bot input type, auth cookie, CSP, same-origin storage, external network policy, and one harmless canary.",
      "Avoid repeated bot triggers until the oracle is identified.",
    ],
    next: ["Run ctf-web-runtime-map and ctf-web-reflection-map before XSS payload variants."],
  },
  "url-parser": {
    signals: [/url=|uri=|next=|return=|redirect|callback|webhook|image|fetch|proxy|ssrf/i],
    checks: [
      "Compare relative URL, same-origin absolute URL, benign off-origin URL, scheme-relative URL, encoded host, and userinfo form one at a time.",
      "Use safe benign targets only; record redirect/fetch/oracle class.",
    ],
    next: ["If parser branch differs, choose redirect/open-fetch/SSRF hypothesis and stop generic variants."],
  },
}

export default tool({
  description:
    "CTF Web template check: Jaeles/Nuclei-inspired rule selector for CTF-shaped black-box probes. It maps observed signals to focused one-variable checks and next-tool routing; it does not execute payloads.",
  args: {
    evidence: tool.schema
      .string()
      .describe("Observed headers, routes, JS findings, forms, errors, or blackbox-map output."),
    family: tool.schema
      .string()
      .optional()
      .describe(
        "Optional explicit family: method-override, content-type-confusion, path-normalization, host-trust, cache-key, graphql, jwt-shape, upload-storage, admin-bot-runtime, url-parser.",
      ),
    maxMatches: tool.schema.number().optional().describe("Maximum matched families. Default 5."),
  },
  async execute(args) {
    const requested = args.family?.trim().toLowerCase()
    const max = Math.max(1, Math.min(args.maxMatches ?? 5, 10))
    const matches: string[] = []
    const checks: string[] = []
    const next: string[] = []
    for (const [name, spec] of Object.entries(templates)) {
      if (requested && requested !== name) continue
      const score = spec.signals.filter((re) => re.test(args.evidence)).length
      if (requested || score) {
        matches.push(`${name}: score=${requested ? "forced" : score}`)
        checks.push(...spec.checks.map((x) => `${name}: ${x}`))
        next.push(...spec.next.map((x) => `${name}: ${x}`))
      }
      if (matches.length >= max) break
    }
    return [
      "verdict: template_check_v9",
      "matched_families:",
      ...(matches.length ? matches.map((x) => `- ${x}`) : ["- none"]),
      "first_safe_checks:",
      ...(checks.length
        ? unique(checks, 30).map((x) => `- ${x}`)
        : ["- no family matched; rerun ctf-web-fingerprint/blackbox-map/js-surface-map or provide stronger evidence"]),
      "recommended_next:",
      ...(next.length
        ? unique(next, 30).map((x) => `- ${x}`)
        : ["- rank only evidence-backed hypotheses; avoid template scanning without a signal"]),
      "decision_state_contract:",
      "- Convert one matched family into a single probe contract.",
      "- Confirm/falsify/distinguish one hypothesis; do not run all templates as a scanner.",
    ].join("\n")
  },
})
