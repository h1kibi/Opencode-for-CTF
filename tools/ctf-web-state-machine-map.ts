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
    for (const [key, value] of Object.entries(parsed)) if (["string", "number", "boolean"].includes(typeof value)) headers[key] = String(value)
  }
  if (cookie?.trim()) headers.Cookie = cookie.trim()
  return headers
}

function unique(items: string[], limit = 120) {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit)
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

function actionWords(s: string) {
  return /login|logout|register|reset|create|new|edit|update|delete|remove|approve|reject|publish|submit|checkout|pay|refund|upload|download|export|import|share|report|preview|render|admin|invite|join/i.test(s)
}

function attr(attrs: string, name: string) {
  return attrs.match(new RegExp(`${name}=["']?([^"'\\s>]+)`, "i"))?.[1]
}

function extractForms(html: string, base: URL) {
  return Array.from(html.matchAll(/<form\b([\s\S]*?)>([\s\S]*?)<\/form>/gi), (m) => {
    const attrs = m[1]
    const body = m[2]
    const method = (attr(attrs, "method") ?? "GET").toUpperCase()
    const actionRaw = attr(attrs, "action") ?? base.pathname
    const action = new URL(actionRaw, base).pathname
    const inputs = unique(Array.from(body.matchAll(/<(?:input|textarea|select|button)\b[\s\S]*?(?:name|id)=["']([^"']+)/gi), (x) => x[1]), 60)
    return `${method} ${action} inputs=${inputs.join(",") || "none"}`
  }).slice(0, 80)
}

function extractEdges(text: string) {
  const routes = unique(Array.from(text.matchAll(/["'`]((?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+){1,10}(?:\?[A-Za-z0-9_.~!$&'()*+,;=:@%/?-]*)?)["'`]/g), (m) => m[1]), 240)
  const edges = unique(routes.filter(actionWords), 160)
  const objectIds = unique(Array.from(text.matchAll(/\b(?:id|uid|userId|ownerId|tenantId|teamId|projectId|postId|fileId|orderId|invoiceId|token)["'\s:=]+([A-Za-z0-9_-]{1,100})/g), (m) => m[0].slice(0, 120)), 120)
  const states = unique(Array.from(text.matchAll(/\b(?:draft|pending|approved|rejected|published|paid|unpaid|admin|user|guest|owner|member|locked|active|disabled|verified|unverified)\b/gi), (m) => m[0].toLowerCase()), 100)
  return { routes, edges, objectIds, states }
}

export default tool({
  description: "CTF Web state-machine map: model black-box workflow/authz surfaces from pages, forms, JS route literals, actions, object IDs, roles, and transitions. Helps medium/hard logic, IDOR, replay, skip-step, race, and CSRF-boundary challenges.",
  args: {
    url: tool.schema.string().describe("Authorized CTF URL."),
    headersJson: tool.schema.string().optional().describe("Optional JSON headers for primary session."),
    cookie: tool.schema.string().optional().describe("Optional primary Cookie header."),
    extraUrls: tool.schema.string().optional().describe("Optional newline/comma-separated same-origin URLs or paths already discovered."),
    maxFetches: tool.schema.number().optional().describe("Max URLs to fetch. Default 12, hard cap 30."),
  },
  async execute(args) {
    const base = new URL(normalizeUrl(args.url))
    const headers = parseHeadersJson(args.headersJson, args.cookie)
    const seeds = unique([base.pathname || "/", ...(args.extraUrls?.split(/[\n,]/).map((x) => x.trim()) ?? [])], Math.min(args.maxFetches ?? 12, 30))
    const status: string[] = []
    const forms: string[] = []
    const texts: string[] = []
    const errors: string[] = []
    for (const seed of seeds) {
      try {
        const u = new URL(seed, base)
        if (u.origin !== base.origin) continue
        const r = await fetchWithTimeout(u, { headers })
        const body = await readTextCapped(r, 600000)
        status.push(`${u.pathname}: ${r.status} ${r.headers.get("content-type") ?? ""}`)
        forms.push(...extractForms(body, u))
        texts.push(`${u.pathname}\n${body}`)
      } catch (err) {
        errors.push(`${seed}: ${err}`)
      }
    }
    const combined = `${texts.join("\n")}\n${forms.join("\n")}`
    const e = extractEdges(combined)
    const transitions = unique([...forms, ...e.edges].filter(actionWords), 180)
    const guarded = unique(transitions.filter((x) => /admin|approve|delete|pay|refund|export|download|invite|role|tenant|owner|publish/i.test(x)), 100)
    const replaySkip = unique(transitions.filter((x) => /confirm|verify|approve|checkout|pay|callback|webhook|preview|publish|reset|token/i.test(x)), 100)
    const race = unique(transitions.filter((x) => /pay|checkout|coupon|redeem|transfer|withdraw|refund|vote|claim|limit|quota|stock/i.test(x)), 80)
    const next = unique([
      guarded.length ? "run ctf-web-authz-matrix with user_a/user_b/object IDs" : "",
      replaySkip.length ? "test one replay/skip-step differential with ctf-web-diff-probe before variants" : "",
      race.length ? "only consider race after state oracle and idempotency are understood" : "",
      e.objectIds.length ? "record object ID sources and owner assumptions in ctf-decision-state" : "",
      "rank state-machine hypotheses by direct flag path and observable oracle",
    ])
    return [
      `url: ${base}`,
      `verdict: state_machine_map_v9`,
      "status:",
      ...(status.length ? status.map((x) => `- ${x}`) : ["- none"]),
      `states_roles: ${e.states.length ? e.states.join(" | ") : "none"}`,
      `object_id_patterns: ${e.objectIds.length ? e.objectIds.join(" | ") : "none"}`,
      "transitions:",
      ...(transitions.length ? transitions.map((x) => `- ${x}`) : ["- none"]),
      "guarded_transitions:",
      ...(guarded.length ? guarded.map((x) => `- ${x}`) : ["- none"]),
      "replay_skip_candidates:",
      ...(replaySkip.length ? replaySkip.map((x) => `- ${x}`) : ["- none"]),
      "race_candidates:",
      ...(race.length ? race.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...next.map((x) => `- ${x}`),
      "errors:",
      ...(errors.length ? errors.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
