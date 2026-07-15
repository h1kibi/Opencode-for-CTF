import { tool } from "@opencode-ai/plugin"

function sameOrigin(base: URL, candidate: string) {
  try {
    const url = new URL(candidate, base)
    return url.origin === base.origin ? url.toString() : undefined
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(url: URL, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export default tool({
  description: "CTF web probe: fetch one explicit URL plus robots.txt and sitemap.xml, summarize status, headers, cookies, forms, links, scripts, and likely bug-class hints.",
  args: {
    url: tool.schema.string().url().describe("Authorized CTF URL to probe"),
  },
  async execute(args) {
    const base = new URL(args.url)
    const response = await fetchWithTimeout(base)
    const text = await response.text()
    const headers = Array.from(response.headers.entries())
    const cookies = headers.filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v)
    const headerText = headers.map(([k, v]) => `${k}: ${v}`).join("\n")
    const combinedText = `${text}\n${cookies.join("\n")}\n${headerText}`
    const forms = Array.from(text.matchAll(/<form\b[\s\S]*?<\/form>/gi), (m) => m[0].replace(/\s+/g, " ").slice(0, 300)).slice(0, 20)
    const links = Array.from(new Set(Array.from(text.matchAll(/href=["']([^"']+)/gi), (m) => sameOrigin(base, m[1])).filter(Boolean))).slice(0, 50)
    const scripts = Array.from(new Set(Array.from(text.matchAll(/src=["']([^"']+\.js[^"']*)/gi), (m) => sameOrigin(base, m[1])).filter(Boolean))).slice(0, 50)
    const hints = new Set<string>()
    if (/csrf|xsrf/i.test(combinedText)) hints.add("csrf/session")
    if (/jwt|eyJ[A-Za-z0-9_-]+\./.test(combinedText)) hints.add("jwt")
    if (/upload|multipart\/form-data|type=["']file/i.test(text)) hints.add("upload")
    if (/template|jinja|twig|handlebars|ejs/i.test(text)) hints.add("ssti/template")
    if (/graphql/i.test(text)) hints.add("graphql")
    if (/redirect|url=|next=|return=/i.test(text)) hints.add("redirect/ssrf candidates")
    if (/select|sqlite|mysql|postgres|sql/i.test(text)) hints.add("sqli candidates")
    if (/bot|admin.?bot|phantomjs|selenium|headless/i.test(combinedText)) hints.add("admin-bot/browser")
    if (/ueditor|editor|filemanager|uploadfile|listfile|controller/i.test(text)) hints.add("editor/file-write candidates")
    if (/debug.?true|traceback|stack trace|werkzeug|django|flask|express error/i.test(text)) hints.add("debug/source-leak")
    if (/jsessionid|tomcat|servlet|jsp|spring|whitelabel error page/i.test(combinedText)) hints.add("java-web")
    if (/sessionid|csrftoken|django/i.test(combinedText)) hints.add("django/session")
    if (/phantomjs/i.test(combinedText)) hints.add("phantomjs-legacy-js")

    const primitiveCandidates: string[] = []
    const phaseSuggestions: string[] = []
    const recommendedNext: string[] = []
    const riskWarnings: string[] = []
    const attackQueueSeed: string[] = []

    if (hints.has("admin-bot/browser")) {
      primitiveCandidates.push("admin bot: high candidate")
      attackQueueSeed.push("admin-bot path | expected primitive: privileged browser execution | value 3 | cost 3 | risk 3 | stability 3")
      recommendedNext.push("identify bot runtime; use one low-risk ES5/XHR proof only")
      riskWarnings.push("avoid repeated bot-triggering payloads")
    }

    if (hints.has("editor/file-write candidates")) {
      primitiveCandidates.push("editor/file-write: high or critical candidate")
      attackQueueSeed.push("editor/file-write path | expected primitive: server-side file write | value 5 | cost 2 | risk 4 | stability 4")
      recommendedNext.push("do not overwrite files yet; build a file-write matrix and use canary checks")
      riskWarnings.push("file overwrite is high risk until create/overwrite behavior is known")
    }

    if (hints.has("debug/source-leak")) {
      primitiveCandidates.push("debug/source leak: high candidate")
      attackQueueSeed.push("debug/source-leak path | expected primitive: path/config/source disclosure | value 4 | cost 1 | risk 1 | stability 5")
      recommendedNext.push("prefer source/path/config mapping before payload fuzzing")
    }

    if (hints.has("java-web")) {
      primitiveCandidates.push("java-web framework: source/sink triage candidate")
      recommendedNext.push("use Java Web source/framework triage if source, jar, war, pom.xml, or stack traces are available")
    }

    if (primitiveCandidates.length > 0) {
      phaseSuggestions.push("stay in recon or attack-queue until candidates are ranked")
      phaseSuggestions.push("enter primitive-lock only after one critical or two high primitives are confirmed")
    }

    const robotsUrl = new URL("/robots.txt", base)
    const sitemapUrl = new URL("/sitemap.xml", base)
    const extras: string[] = []
    for (const extra of [robotsUrl, sitemapUrl]) {
      try {
        const r = await fetchWithTimeout(extra)
        extras.push(`${extra.pathname}: ${r.status} ${(await r.text()).slice(0, 1000).replace(/\s+$/g, "")}`)
      } catch (err) {
        extras.push(`${extra.pathname}: fetch failed: ${err}`)
      }
    }

    return [
      `url: ${base}`,
      `status: ${response.status}`,
      `redirect: ${response.headers.get("location") ?? "none"}`,
      "headers:",
      ...headers.map(([k, v]) => `- ${k}: ${v}`),
      "cookies:",
      ...cookies.map((x) => `- ${x}`),
      "forms:",
      ...forms.map((x) => `- ${x}`),
      "links:",
      ...links.map((x) => `- ${x}`),
      "scripts:",
      ...scripts.map((x) => `- ${x}`),
      `hints: ${Array.from(hints).join(", ") || "none"}`,
      "extras:",
      ...extras,
      "primitive candidates:",
      ...(primitiveCandidates.length ? primitiveCandidates.map((x) => `- ${x}`) : ["- none"]),
      "attack queue seed:",
      ...(attackQueueSeed.length ? attackQueueSeed.map((x) => `- ${x}`) : ["- none"]),
      "phase suggestions:",
      ...(phaseSuggestions.length ? phaseSuggestions.map((x) => `- ${x}`) : ["- stay in recon until map is complete"]),
      "recommended next:",
      ...(recommendedNext.length ? recommendedNext.map((x) => `- ${x}`) : ["- build route/input/auth map and attack queue"]),
      "risk warnings:",
      ...(riskWarnings.length ? riskWarnings.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
