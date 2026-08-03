import { tool } from "@opencode-ai/plugin"
import { safeExec } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"

const ALLOWED_TYPES = new Set(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SOA", "SRV", "CAA", "PTR"])
const DEFAULT_TYPES = ["A", "AAAA", "TXT", "CNAME", "MX", "NS"]
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

type RecordRow = { type: string; name: string; ttl?: number; value: string }

type DnsPayload = {
  schemaVersion: "misc_dns.v1"
  domain: string
  requestedTypes: string[]
  backend: "dnspython" | "dig" | "nslookup" | "none"
  status: "ready" | "degraded" | "blocked"
  records: RecordRow[]
  observations: string[]
  error?: string
}

function normalizeTypes(input?: string[]): string[] {
  const values = (input?.length ? input : DEFAULT_TYPES).map((value) => value.trim().toUpperCase())
  return [...new Set(values.filter((value) => ALLOWED_TYPES.has(value)))].slice(0, 8)
}

function parseDig(output: string, type: string): RecordRow[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(";") && !line.startsWith("<failed:"))
    .map((line) => {
      const fields = line.split(/\s+/)
      const ttlIndex = fields.findIndex((field) => /^\d+$/.test(field))
      const name = ttlIndex > 0 ? fields[0] : ""
      const ttl = ttlIndex > 0 ? Number(fields[ttlIndex]) : undefined
      const value = ttlIndex > 0 ? fields.slice(ttlIndex + 2).join(" ") : line
      return { type, name, ttl, value }
    })
}

function parseNslookup(output: string, type: string, domain: string): RecordRow[] {
  const rows: RecordRow[] = []
  let currentName = domain
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^server(?:\s|:)/i.test(line) || /^address(?:es)?(?:\s|:)/i.test(line)) continue
    if (/^name\s*:/i.test(line)) {
      currentName = line.slice(line.indexOf(":") + 1).trim() || domain
      continue
    }
    if (/^non-authoritative answer/i.test(line) || /^authoritative answer/i.test(line)) continue
    const value = line.replace(/^(?:text|canonical name|mail exchanger|mail exchange|aliases?)\s*:\s*/i, "").trim()
    if (!value || /^\*+/.test(value) || /^dns request timed out/i.test(value)) continue
    rows.push({ type, name: currentName, value })
  }
  return rows
}

function pythonScript(): string {
  return [
    "import json, sys",
    "try:",
    " import dns.resolver",
    "except Exception as e:",
    " print(json.dumps({'error': 'dnspython unavailable: ' + str(e)})); raise SystemExit(3)",
    "domain = sys.argv[1]; types = json.loads(sys.argv[2])",
    "resolver = dns.resolver.Resolver(); resolver.timeout = 2.0; resolver.lifetime = 4.0",
    "rows = []",
    "for kind in types:",
    " try:",
    "  answer = resolver.resolve(domain, kind, raise_on_no_answer=False)",
    "  for rr in answer:",
    "   rows.append({'type': kind, 'name': str(answer.qname), 'ttl': int(answer.rrset.ttl) if answer.rrset else None, 'value': rr.to_text()})",
    " except Exception as e:",
    "  rows.append({'type': kind, 'name': domain, 'value': '<no-answer: ' + type(e).__name__ + '>'})",
    "print(json.dumps({'records': rows}, ensure_ascii=False))",
  ].join("\n")
}

export default tool({
  description:
    "Bounded DNS record probe for authorized CTF/lab domains. Queries only explicitly allowed record types, prefers dnspython, falls back to dig, preserves TTL/source context, and never treats DNS text as a verified flag.",
  args: {
    domain: tool.schema.string().describe("Domain name from the challenge or authorized lab."),
    recordTypes: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("A, AAAA, TXT, CNAME, MX, NS, SOA, SRV, CAA, or PTR; default is a bounded common set."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const domain = args.domain.trim().replace(/\.$/, "")
    const requestedTypes = normalizeTypes(args.recordTypes)
    const base: DnsPayload = {
      schemaVersion: "misc_dns.v1",
      domain,
      requestedTypes,
      backend: "none",
      status: "blocked",
      records: [],
      observations: [],
    }
    if (!DOMAIN_RE.test(domain) || requestedTypes.length === 0) {
      base.error = "invalid domain or record type selection"
      return args.jsonOnly
        ? JSON.stringify(base, null, 2)
        : [`CTF_DNS_PROBE:`, `- status: ${base.status}`, `- error: ${base.error}`].join("\n")
    }

    const directory = directoryFromContext(context)
    const workspace = workspaceRootFromContext(context)
    const cwd = resolveFromDirectoryInsideWorkspace(directory, workspace, ".")
    const py = await safeExec(
      "python",
      ["-c", pythonScript(), domain, JSON.stringify(requestedTypes)],
      cwd,
      6500,
      256 * 1024,
    )
    if (py.ok) {
      try {
        const parsed = JSON.parse(py.output)
        base.backend = "dnspython"
        base.status = "ready"
        base.records = Array.isArray(parsed.records) ? parsed.records.slice(0, 120) : []
      } catch {
        base.error = "dnspython returned non-JSON output"
      }
    }

    if (base.backend === "none") {
      const rows: RecordRow[] = []
      let digSucceeded = false
      for (const type of requestedTypes) {
        const result = await safeExec("dig", ["+short", "+time=2", "+tries=1", domain, type], cwd, 2200, 128 * 1024)
        if (result.ok) {
          digSucceeded = true
          rows.push(...parseDig(result.output, type).slice(0, 40))
        }
      }
      if (digSucceeded || rows.length) {
        base.backend = "dig"
        base.status = "ready"
        base.records = rows.slice(0, 120)
      } else {
        // nslookup is present on stock Windows installations and is a useful
        // last-resort resolver when neither dnspython nor dig is installed.
        for (const type of requestedTypes) {
          const result = await safeExec("nslookup", [`-type=${type}`, domain], cwd, 2200, 128 * 1024)
          if (result.ok) rows.push(...parseNslookup(result.output, type, domain).slice(0, 40))
        }
        if (rows.length) {
          base.backend = "nslookup"
          base.status = "ready"
          base.records = rows.slice(0, 120)
        } else {
          base.error = "dnspython, dig, and nslookup were unavailable or returned no records"
        }
      }
    }

    const realRecords = base.records.filter((record) => !record.value.startsWith("<no-answer:"))
    if (realRecords.some((record) => record.type === "TXT"))
      base.observations.push(
        "TXT answers present; preserve exact quoting and decode only with an evidence-backed hypothesis.",
      )
    if (realRecords.some((record) => record.type === "NS"))
      base.observations.push(
        "NS answers present; consider delegation/zone-boundary reasoning before any transfer attempt.",
      )
    if (realRecords.some((record) => /[A-Za-z0-9+/]{20,}={0,2}/.test(record.value)))
      base.observations.push(
        "A base64-like DNS value was observed; it is only an untrusted hint until the challenge oracle confirms meaning.",
      )
    if (base.backend === "none") base.status = "degraded"

    if (args.jsonOnly) return JSON.stringify(base, null, 2)
    return [
      "CTF_DNS_PROBE:",
      `- schema: ${base.schemaVersion}`,
      `- domain: ${base.domain}`,
      `- backend: ${base.backend}`,
      `- status: ${base.status}`,
      `- queried: ${base.requestedTypes.join(", ")}`,
      "- records:",
      ...(base.records.length
        ? base.records.map((record) => `  - ${record.type} ${record.name} ${record.ttl ?? "?"} ${record.value}`)
        : ["  - none"]),
      "- observations:",
      ...(base.observations.length ? base.observations.map((observation) => `  - ${observation}`) : ["  - none"]),
      ...(base.error ? [`- error: ${base.error}`] : []),
    ].join("\n")
  },
})
