import { tool } from "@opencode-ai/plugin"

function unique(items: string[], limit = 80) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
}

export default tool({
  description: "CTF Web fuzz plan: ffuf/gobuster-inspired planner that creates a low-noise fuzzing strategy, baseline filters, stop conditions, and ranking rules. It does not execute fuzzing.",
  args: {
    target: tool.schema.string().describe("Target URL or request template."),
    dimension: tool.schema.string().describe("path | vhost | param | header | method | content-type | value | api-route"),
    evidence: tool.schema.string().optional().describe("Observed routes/forms/status/baseline/tech hints."),
    goal: tool.schema.string().optional().describe("What the fuzz should discover or distinguish."),
    budget: tool.schema.string().optional().describe("tiny | small | medium. Default small."),
  },
  async execute(args) {
    const dimension = args.dimension.trim().toLowerCase()
    const budget = (args.budget || "small").toLowerCase()
    const evidence = args.evidence || ""
    const requests = budget === "tiny" ? "<=50" : budget === "medium" ? "<=1500" : "<=300"
    const filters: string[] = ["calibrate one known-miss baseline first", "filter by stable status+length+words, not status alone", "manually inspect top anomalies before continuing"]
    const stops: string[] = ["stop after first new route class with a stronger direct hypothesis", "stop if 3 consecutive result groups add no new differential", "stop before state-changing endpoints unless selected by ctf-decision-state"]
    const commandShape: string[] = []
    const wordlists: string[] = []
    const rank: string[] = ["new status not seen in baseline", "large body-length delta", "new content-type", "auth boundary change", "route keyword intersects flag/admin/debug/upload/download/report/api"]
    if (dimension === "path" || dimension === "api-route") {
      commandShape.push("ffuf -u <base>/FUZZ -w <small-ctf-or-framework-wordlist> -mc all -fs <baseline-size> -of json")
      wordlists.push("small CTF common paths", "framework-specific paths from fingerprint", "JS-discovered route stems first")
    } else if (dimension === "vhost") {
      commandShape.push("ffuf -u http://<host>/ -H 'Host: FUZZ.<host>' -w <tiny-vhost-list> -mc all -fs <baseline-size>")
      wordlists.push("admin/dev/internal/api/stage/local/test + challenge-specific host stems")
      stops.push("stop if target is localhost-only or Host header is irrelevant")
    } else if (dimension === "param") {
      commandShape.push("ffuf -u '<url>?FUZZ=ctf_probe' -w <param-list> -mc all -fs <baseline-size>")
      wordlists.push("params mined from JS/forms/archive", "id/url/file/path/next/debug/template/search/q/token")
    } else if (dimension === "header") {
      commandShape.push("ffuf -u <url> -H 'FUZZ: ctf_probe' -w <tiny-header-list> -mc all -fs <baseline-size>")
      wordlists.push("X-Forwarded-Host/X-Original-URL/X-Rewrite-URL/X-HTTP-Method-Override/Forwarded")
    } else if (dimension === "method") {
      commandShape.push("for m in GET POST PUT PATCH DELETE OPTIONS HEAD; do curl -i -X $m <url>; done")
      filters.push("unsafe methods require explicit challenge intent")
    } else if (dimension === "content-type") {
      commandShape.push("compare application/json, x-www-form-urlencoded, multipart/form-data, text/plain with one stable body")
      filters.push("mutate content-type only; keep method/body constant")
    } else if (dimension === "value") {
      commandShape.push("ffuf -u '<url>?param=FUZZ' -w <tiny-value-probes> -mc all -fs <baseline-size>")
      wordlists.push("boolean/null/array/object/path/url/numeric boundary canaries")
    } else {
      commandShape.push("BLOCK: unknown dimension; choose path/vhost/param/header/method/content-type/value/api-route")
    }
    const evidenceHints = unique([
      /next|react|vue|vite|webpack|spa/i.test(evidence) ? "prefer JS-discovered routes before generic path fuzz" : "",
      /spring|actuator|java|tomcat/i.test(evidence) ? "include Java/Spring debug paths" : "",
      /php|laravel|thinkphp|wordpress/i.test(evidence) ? "include PHP/framework path stems" : "",
      /graphql/i.test(evidence) ? "GraphQL route checks outrank broad path fuzz" : "",
      /upload|report|bot|preview/i.test(evidence) ? "fuzz only after canary/runtime profile" : "",
    ])
    return [
      `target: ${args.target}`,
      `verdict: fuzz_plan_v9`,
      `dimension: ${dimension}`,
      `budget: ${budget} (${requests} requests unless new differential appears)`,
      `goal: ${args.goal || "discover one high-value differential, not exhaustive coverage"}`,
      "command_shape:",
      ...commandShape.map((x) => `- ${x}`),
      "wordlist_strategy:",
      ...(wordlists.length ? wordlists.map((x) => `- ${x}`) : ["- no wordlist needed; use enumerated one-variable comparisons"]),
      "baseline_filters:",
      ...filters.map((x) => `- ${x}`),
      "ranking_rules:",
      ...rank.map((x) => `- ${x}`),
      "stop_conditions:",
      ...stops.map((x) => `- ${x}`),
      "evidence_adaptations:",
      ...(evidenceHints.length ? evidenceHints.map((x) => `- ${x}`) : ["- none"]),
      "decision_state_contract:",
      "- create a probe contract before executing",
      "- feed first meaningful anomaly to observe",
      "- do not run same-family expansion without new differential",
    ].join("\n")
  },
})
