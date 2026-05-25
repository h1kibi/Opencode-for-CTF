import { tool } from "@opencode-ai/plugin"

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])

const objectIdPatterns = [
  /\b(id|uuid|uid|pk)\b/i,
  /\b(userId|accountId|orderId|productId|assetId)\b/i,
  /\b([a-zA-Z_]+[Ii][Dd])\b/,
]

const candidateBugHints: Record<string, string[]> = {
  GET: ["idor", "lfi", "sqli", "nosqli", "ssrf", "xss"],
  POST: ["mass-assignment", "sqli", "nosqli", "xxe", "ssrf", "deser", "race"],
  PUT: ["idor", "mass-assignment", "sqli", "nosqli"],
  PATCH: ["idor", "mass-assignment"],
  DELETE: ["idor"],
}

function guessAuth(path: string) {
  const adminPaths = /\/admin\b|\/manage\b|\/dashboard\b|\/config\b|\/internal\b/i
  const publicPaths = /\/login\b|\/register\b|\/signup\b|\/public\b|\/api\/public\b/i
  if (adminPaths.test(path)) return "likely auth"
  if (publicPaths.test(path)) return "likely public"
  return "unknown"
}

function guessObjectId(path: string, paramNames: string[]) {
  const inPath = objectIdPatterns.some((re) => re.test(path))
  const inParam = paramNames.some((p) => objectIdPatterns.some((re) => re.test(p)))
  return inPath || inParam
}

function firstSafeCheck(path: string, method: string) {
  const m = method.toUpperCase()

  if (m === "GET") {
    return `curl -s -o /dev/null -w "%{http_code}" "${path}"`
  }

  if (m === "HEAD") {
    return `curl -s -I -o /dev/null -w "%{http_code}" "${path}"`
  }

  if (m === "OPTIONS") {
    return `curl -s -X OPTIONS -o /dev/null -w "%{http_code}" "${path}"`
  }

  if (m === "DELETE") {
    return "DO NOT send DELETE as first safe check; verify via OPTIONS, source review, route docs, or a non-mutating equivalent first"
  }

  if (["POST", "PUT", "PATCH"].includes(m)) {
    return "State-changing method: first inspect source/schema, then use a harmless canary body only after recording a High-Risk Action Plan"
  }

  return `curl -s -o /dev/null -w "%{http_code}" "${path}"`
}

type ApiEntry = {
  method: string
  path: string
  parameters?: string[]
}

function parsePlaintextApiList(content: string): ApiEntry[] {
  const entries: ApiEntry[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const match = line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i)
    if (!match) continue

    entries.push({
      method: match[1].toUpperCase(),
      path: match[2],
      parameters: [],
    })
  }

  return entries
}

export default tool({
  description: "CTF API map: scan OpenAPI/Swagger specs or captured API path lists and produce a route table with auth guess, object-id detection, state-changing flag, candidate bug classes, and first safe check commands.",
  args: {
    file: tool.schema.string().describe("Path to an OpenAPI/Swagger JSON or YAML file, or a plaintext API path list"),
  },
  async execute(args) {
    const fs = await import("fs/promises")
    const path = await import("path")
    const filePath = path.resolve(args.file)

    let content: string
    try {
      content = await fs.readFile(filePath, "utf8")
    } catch (err) {
      return `API map failed reading file: ${err}`
    }

    const rows: string[][] = []
    rows.push(["Method", "Path", "Auth Needed", "Object ID", "State-Changing", "Candidate Bugs", "First Safe Check"])

    let entries: ApiEntry[] = []

    try {
      const spec = JSON.parse(content)
      const paths = spec.paths || {}

      for (const [routePath, methods] of Object.entries(paths)) {
        if (!methods || typeof methods !== "object") continue

        for (const [method, detail] of Object.entries(methods as Record<string, any>)) {
          const paramNames: string[] = []

          if (detail?.parameters) {
            for (const p of detail.parameters) {
              if (p.name) paramNames.push(p.name)
            }
          }

          entries.push({
            method: method.toUpperCase(),
            path: routePath,
            parameters: paramNames,
          })
        }
      }
    } catch {
      entries = parsePlaintextApiList(content)
    }

    if (entries.length === 0) {
      return "API map: no API paths found. Provide JSON OpenAPI/Swagger or plaintext lines like `GET /api/users/{id}`."
    }

    for (const entry of entries) {
      const m = entry.method.toUpperCase()
      const isStateChanging = stateChangingMethods.has(m)
      const auth = guessAuth(entry.path)
      const hasObjectId = guessObjectId(entry.path, entry.parameters ?? [])
      const bugs = candidateBugHints[m]?.join(", ") ?? ""
      const safeCheck = firstSafeCheck(entry.path, m)

      rows.push([m, entry.path, auth, hasObjectId ? "yes" : "no", isStateChanging ? "yes" : "no", bugs, safeCheck])
    }

    if (rows.length === 1) return "API map: no paths found"

    return rows.map((r) => r.join(" | ")).join("\n")
  },
})
