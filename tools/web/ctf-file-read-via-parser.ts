import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { writeProbeEvidence } from "../lib/ctf-request-budget.ts"
import { directoryFromContext } from "../lib/workspace-path.ts"

function classify(text: string, target: string) {
  const compact = text.replace(/\s+/g, " ").slice(0, 2_000)
  const traceback = [...text.matchAll(/(?:File|file)\s+["']([^"']+)["']\s*,?\s*line\s+(\d+)/gi)].map((m) => ({ file: m[1], line: Number(m[2]) }))
  if (!text.trim()) return { state: "file_empty_or_no_echo", reason: "response contains no text", traceback }
  if (/StartTag|invalid element name|not well-formed|parseerror|syntaxerror/i.test(compact)) {
    return { state: "file_read_success_parser_conflict", reason: "content reached a parser error boundary", traceback }
  }
  if (/external entity|doctype|xml parsing disabled|entity.*forbidden/i.test(compact)) {
    return { state: "xxe_disabled_or_filtered", reason: compact.slice(0, 500), traceback }
  }
  if (/no such file|not found|does not exist|enoent/i.test(compact)) {
    return { state: "file_not_found", reason: compact.slice(0, 500), traceback }
  }
  return { state: "file_read_success", reason: `content returned for ${target}`, traceback }
}
function keywordHits(text: string) {
  const expressions = [
    /FLAG\s*[:=]\s*[^\s,;]+/gi,
    /flag\s*[:=]\s*[^\s,;]+/g,
    /open\s*\([^\n]{0,180}/gi,
    /os\.environ[^\n]{0,180}/gi,
    /SECRET_KEY[^\n]{0,180}/gi,
    /\/run\/secrets[^\n]{0,180}/gi,
    /kubernetes|k8s|secret(?:s)?\/[A-Za-z0-9._-]+/gi,
    /(?:sqlite|postgres|mysql|mongodb)[^\n]{0,160}/gi,
  ]
  return [...new Set(expressions.flatMap((pattern) => Array.from(text.matchAll(pattern), (match) => match[0].trim())))].slice(0, 100)
}

export default tool({
  description:
    "Parse and classify a file-read-via-parser response without blindly retrying: distinguishes missing/empty/XXE-disabled/parser-conflict/success, extracts traceback paths and source/flag keywords, and emits bounded evidence.",
  args: {
    targetFile: tool.schema.string(),
    responseText: tool.schema.string().describe("Captured parser/preview response text"),
    contentType: tool.schema.string().optional(),
    challenge: tool.schema.string().optional(),
    chunkSize: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const directory = directoryFromContext(context)
    const classification = classify(args.responseText, args.targetFile)
    const payload = {
      tool: "ctf-file-read-via-parser",
      target: args.targetFile,
      content_type: args.contentType || "unknown",
      response_bytes: Buffer.byteLength(args.responseText),
      response_hash: createHash("sha256").update(args.responseText).digest("hex").slice(0, 16),
      ...classification,
      keyword_hits: keywordHits(args.responseText),
      chunk_plan: {
        chunkSize: Math.max(512, Math.min(Math.floor(args.chunkSize ?? 4096), 64_000)),
        strategy: classification.state === "file_read_success_parser_conflict" ? "preserve parser error and request bounded source/config targets individually" : "no blind retry",
      },
      next_probe: classification.state === "file_read_success_parser_conflict" ? "try a source/config target or a server-supported base64/OOB transform; do not treat parser error as XXE failure" : "promote only after an independent oracle or flag verification",
    }
    const evidenceRef = await writeProbeEvidence(directory, args.challenge || "file-read-parser", payload)
    return JSON.stringify({ ...payload, evidence_ref: evidenceRef }, null, 2)
  },
})
