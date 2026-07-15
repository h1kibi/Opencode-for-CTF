import { createHash } from "node:crypto"
import { tool } from "@opencode-ai/plugin"

function normalizeUrl(raw: string) {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^[A-Za-z0-9.-]+:\d+(?:\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

function parseHeadersJson(headersJson?: string) {
  const headers: Record<string, string> = {}
  if (headersJson?.trim()) {
    const parsed = JSON.parse(headersJson) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") headers[key] = String(value)
    }
  }
  return headers
}

function normalizeMethod(method?: string) {
  const m = (method || "GET").trim().toUpperCase()
  if (!/^[A-Z]+$/.test(m)) throw new Error(`invalid HTTP method: ${method}`)
  return m
}

function applyTemplate(value: string | undefined, id: string) {
  return (value ?? "").replace(/\{\{id\}\}/g, id)
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

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}

type Cell = { label: string; object: string; status: number; length: number; hash: string; location: string; snippet: string }

async function requestCell(label: string, object: string, url: URL, method: string, headers: Record<string, string>, body?: string): Promise<Cell> {
  const init: RequestInit = { method, headers }
  if (body && method !== "GET" && method !== "HEAD") init.body = body
  const response = await fetchWithTimeout(url, init)
  const text = await readTextCapped(response, 500000)
  return {
    label,
    object,
    status: response.status,
    length: Buffer.byteLength(text.text),
    hash: hash(text.text),
    location: response.headers.get("location") ?? "",
    snippet: text.text.replace(/\s+/g, " ").slice(0, 140),
  }
}

function visible(cell: Cell) {
  return cell.status >= 200 && cell.status < 400 && cell.length > 0
}

export default tool({
  description: "CTF Web authz matrix v8: compare anonymous/user_a/user_b access to one or two object IDs for IDOR, horizontal/vertical authz, workflow replay, and CSRF-ish boundary clues. Low-volume and differential, not a fuzzer.",
  args: {
    urlTemplate: tool.schema.string().describe("Endpoint URL or URL template. Use {{id}} where objectIdA/objectIdB should be inserted."),
    method: tool.schema.string().optional().describe("HTTP method. Default GET."),
    headersJson: tool.schema.string().optional().describe("Base JSON headers without Cookie."),
    bodyTemplate: tool.schema.string().optional().describe("Optional body template. Use {{id}} for object IDs. Ignored for GET/HEAD."),
    userACookie: tool.schema.string().optional().describe("Cookie for user A / owner A."),
    userBCookie: tool.schema.string().optional().describe("Cookie for user B / non-owner."),
    objectIdA: tool.schema.string().optional().describe("Object ID owned by user A. Default empty."),
    objectIdB: tool.schema.string().optional().describe("Object ID owned by user B. Optional."),
    includeAnonymous: tool.schema.boolean().optional().describe("Include anonymous request. Default true."),
    csrfHeaderName: tool.schema.string().optional().describe("Optional CSRF header to remove in one comparison, e.g. X-CSRF-Token."),
  },
  async execute(args) {
    const method = normalizeMethod(args.method)
    const baseHeaders = parseHeadersJson(args.headersJson)
    const ids = [args.objectIdA ?? "", args.objectIdB ?? ""].filter((x, i, arr) => i === 0 || (x && x !== arr[0]))
    if (!ids.length) ids.push("")
    const actors: Array<{ label: string; cookie?: string }> = []
    if (args.includeAnonymous !== false) actors.push({ label: "anonymous" })
    if (args.userACookie) actors.push({ label: "user_a", cookie: args.userACookie })
    if (args.userBCookie) actors.push({ label: "user_b", cookie: args.userBCookie })
    if (actors.length < 2) return "BLOCK: provide at least two actor states, e.g. anonymous+user_a or user_a+user_b"

    const cells: Cell[] = []
    const errors: string[] = []
    for (const id of ids) {
      for (const actor of actors) {
        const headers = { ...baseHeaders }
        if (actor.cookie) headers.Cookie = actor.cookie
        const url = new URL(normalizeUrl(applyTemplate(args.urlTemplate, id)))
        const body = method === "GET" || method === "HEAD" ? undefined : applyTemplate(args.bodyTemplate, id)
        try {
          cells.push(await requestCell(actor.label, id || "<none>", url, method, headers, body))
        } catch (err) {
          errors.push(`${actor.label}/${id || "<none>"}: ${err}`)
        }
      }
    }

    if (args.csrfHeaderName) {
      const owner = actors.find((x) => x.cookie)
      if (owner) {
        const headers = { ...baseHeaders }
        delete headers[args.csrfHeaderName]
        if (owner.cookie) headers.Cookie = owner.cookie
        const id = ids[0] ?? ""
        const url = new URL(normalizeUrl(applyTemplate(args.urlTemplate, id)))
        const body = method === "GET" || method === "HEAD" ? undefined : applyTemplate(args.bodyTemplate, id)
        try {
          cells.push(await requestCell(`${owner.label}_no_${args.csrfHeaderName}`, id || "<none>", url, method, headers, body))
        } catch (err) {
          errors.push(`${owner.label}/csrf-removed: ${err}`)
        }
      }
    }

    const findings: string[] = []
    const by = (label: string, object: string) => cells.find((c) => c.label === label && c.object === object)
    const objectA = (args.objectIdA ?? "") || "<none>"
    const objectB = (args.objectIdB ?? "") || "<none>"
    const anonA = by("anonymous", objectA)
    const aA = by("user_a", objectA)
    const bA = by("user_b", objectA)
    const aB = by("user_a", objectB)
    const bB = by("user_b", objectB)

    if (anonA && visible(anonA) && aA && visible(aA)) findings.push("anonymous can access the same object class as authenticated user; check public-by-design vs auth bypass")
    if (aA && bA && visible(aA) && visible(bA) && bA.status === aA.status) findings.push("user_b can access objectIdA with a similar successful status: horizontal IDOR candidate")
    if (aB && bB && visible(bB) && visible(aB) && aB.status === bB.status && objectB !== "<none>") findings.push("user_a can access objectIdB with a similar successful status: reciprocal horizontal IDOR candidate")
    const csrfCell = cells.find((c) => c.label.includes("_no_"))
    if (csrfCell && visible(csrfCell)) findings.push("request still succeeds after removing nominated CSRF header; CSRF/origin boundary candidate")
    if (!findings.length) findings.push("no obvious authz differential from this small matrix")

    const newDifferential = findings.some((x) => !x.startsWith("no obvious"))
    return [
      `verdict: ${newDifferential ? "authz_differential_candidate" : "authz_no_obvious_delta"}`,
      `method: ${method}`,
      "matrix:",
      ...cells.map((c) => `- actor=${c.label} object=${c.object} status=${c.status} len=${c.length} hash=${c.hash} location=${c.location || "none"} snippet=${c.snippet || "none"}`),
      "findings:",
      ...findings.map((x) => `- ${x}`),
      "recommended_next:",
      ...(newDifferential
        ? ["- confirm with a second harmless object/action and then feed observe into ctf-decision-state", "- do not escalate to destructive actions until ownership and flag path are modeled"]
        : ["- rerank; try a different object class, workflow step, optional field, or state transition if evidence supports it"]),
      "decision_state_observe_hint:",
      `- {"family":"authz_matrix","result":"${newDifferential ? "differential" : "no_differential"}","newDifferential":${newDifferential},"evidence":"${findings.join("; ").replace(/"/g, "'")}"}`,
      "errors:",
      ...(errors.length ? errors.map((x) => `- ${x}`) : ["- none"]),
    ].join("\n")
  },
})
