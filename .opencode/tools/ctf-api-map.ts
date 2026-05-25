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
  if (m === "GET") return `curl -s -o /dev/null -w "%{http_code}" "${path}"`
  if (m === "POST") return `curl -s -X POST -H "Content-Type: application/json" -d '{"_safe_probe":true}' -o /dev/null -w "%{http_code}" "${path}"`
  if (m === "PUT") return `curl -s -X PUT -H "Content-Type: application/json" -d '{"_safe_probe":true}' -o /dev/null -w "%{http_code}" "${path}"`
  if (m === "PATCH") return `curl -s -X PATCH -H "Content-Type: application/json" -d '{"_safe_probe":true}' -o /dev/null -w "%{http_code}" "${path}"`
  if (m === "DELETE") return `curl -s -X DELETE -o /dev/null -w "%{http_code}" "${path}"`
  return `curl -s -o /dev/null -w "%{http_code}" "${path}"`
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

    let spec: any
    try {
      spec = JSON.parse(content)
    } catch {
      return "API map: file is not valid JSON (currently only JSON OpenAPI specs supported)"
    }

    const paths = spec.paths || spec.paths || {}
    for (const [routePath, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== "object") continue
      for (const [method, detail] of Object.entries(methods as Record<string, any>)) {
        const m = method.toUpperCase()
        const isStateChanging = stateChangingMethods.has(m)
        const auth = guessAuth(routePath)
        const paramNames: string[] = []
        if (detail?.parameters) {
          for (const p of detail.parameters) {
            if (p.name) paramNames.push(p.name)
          }
        }
        const hasObjectId = guessObjectId(routePath, paramNames)
        const bugs = candidateBugHints[m]?.join(", ") ?? ""
        const safeCheck = firstSafeCheck(routePath, m)

        rows.push([m, routePath, auth, hasObjectId ? "yes" : "no", isStateChanging ? "yes" : "no", bugs, safeCheck])
      }
    }

    if (rows.length === 1) return "API map: no paths found in spec"

    return rows.map((r) => r.join(" | ")).join("\n")
  },
})
