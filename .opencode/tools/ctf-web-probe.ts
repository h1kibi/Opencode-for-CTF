import { tool } from "@opencode-ai/plugin"

function sameOrigin(base: URL, candidate: string) {
  try {
    const url = new URL(candidate, base)
    return url.origin === base.origin ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export default tool({
  description: "CTF web probe: fetch one explicit URL plus robots.txt and sitemap.xml, summarize status, headers, cookies, forms, links, scripts, and likely bug-class hints.",
  args: {
    url: tool.schema.string().url().describe("Authorized CTF URL to probe"),
  },
  async execute(args) {
    const base = new URL(args.url)
    const response = await fetch(base, { redirect: "manual" })
    const text = await response.text()
    const headers = Array.from(response.headers.entries())
    const cookies = headers.filter(([k]) => k.toLowerCase() === "set-cookie").map(([, v]) => v)
    const forms = Array.from(text.matchAll(/<form\b[\s\S]*?<\/form>/gi), (m) => m[0].replace(/\s+/g, " ").slice(0, 300)).slice(0, 20)
    const links = Array.from(new Set(Array.from(text.matchAll(/href=["']([^"']+)/gi), (m) => sameOrigin(base, m[1])).filter(Boolean))).slice(0, 50)
    const scripts = Array.from(new Set(Array.from(text.matchAll(/src=["']([^"']+\.js[^"']*)/gi), (m) => sameOrigin(base, m[1])).filter(Boolean))).slice(0, 50)
    const hints = new Set<string>()
    if (/csrf|xsrf/i.test(text + cookies.join("\n"))) hints.add("csrf/session")
    if (/jwt|eyJ[A-Za-z0-9_-]+\./.test(text + cookies.join("\n"))) hints.add("jwt")
    if (/upload|multipart\/form-data|type=["']file/i.test(text)) hints.add("upload")
    if (/template|jinja|twig|handlebars|ejs/i.test(text)) hints.add("ssti/template")
    if (/graphql/i.test(text)) hints.add("graphql")
    if (/redirect|url=|next=|return=/i.test(text)) hints.add("redirect/ssrf candidates")
    if (/select|sqlite|mysql|postgres|sql/i.test(text)) hints.add("sqli candidates")

    const robotsUrl = new URL("/robots.txt", base)
    const sitemapUrl = new URL("/sitemap.xml", base)
    const extras: string[] = []
    for (const extra of [robotsUrl, sitemapUrl]) {
      try {
        const r = await fetch(extra, { redirect: "manual" })
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
    ].join("\n")
  },
})
