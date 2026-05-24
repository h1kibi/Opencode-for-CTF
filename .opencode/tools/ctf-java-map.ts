import { tool } from "@opencode-ai/plugin"

const routeMethods: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
  RequestMapping: "ANY",
}

const dependencyNames = [
  "shiro",
  "struts",
  "mybatis",
  "fastjson",
  "jackson-databind",
  "xstream",
  "snakeyaml",
  "commons-collections",
  "thymeleaf",
  "freemarker",
  "velocity",
  "spring-boot-starter-actuator",
]

function normalizePath(input: string) {
  const match = input.match(/(?:value\s*=\s*)?["']([^"']+)["']/)
  return match?.[1] ?? "<unknown>"
}

function classNameFromSource(content: string) {
  return content.match(/class\s+(\w+)/)?.[1] ?? "<unknown-class>"
}

function methodNameNear(content: string, index: number) {
  const after = content.slice(index, Math.min(content.length, index + 600))
  return after.match(/(?:public|private|protected)?\s*(?:[\w<>\[\], ?]+)\s+(\w+)\s*\(/)?.[1] ?? "<unknown-method>"
}

function extractXmlVersion(content: string, artifact: string) {
  const escaped = artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = content.match(new RegExp(`<dependency>[\\s\\S]*?<artifactId>${escaped}<\\/artifactId>[\\s\\S]*?<\\/dependency>`, "i"))?.[0]
  return block?.match(/<version>([^<]+)<\/version>/i)?.[1] ?? "unknown"
}

function extractGradleVersion(content: string, artifact: string) {
  const line = content.split(/\r?\n/).find((x) => x.toLowerCase().includes(artifact.toLowerCase()))
  return line?.match(/[:'\"](\d+(?:\.\d+)+(?:[-.\w]*)?)[\'"]?/)?.[1] ?? "unknown"
}

export default tool({
  description: "CTF Java web map: scan source directories for framework, routes, controllers, filters, interceptors, security config, dependencies, dangerous sinks, template engines, deserialization libs, XXE parsers, file sinks, SSRF sinks, and SQL sinks.",
  args: {
    dir: tool.schema.string().describe("Directory containing Java source"),
  },
  async execute(args) {
    const fs = await import("fs/promises")
    const path = await import("path")
    const findings: string[] = []
    const root = path.resolve(args.dir)

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const p = path.join(dir, e.name)
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "target" && e.name !== "build") {
          await walk(p)
        } else if (e.isFile() && /\.(java|jsp|xml|yml|yaml|properties|gradle|mf)$/i.test(e.name)) {
          try {
            const content = await fs.readFile(p, "utf8")
            const rel = path.relative(root, p)
            const klass = classNameFromSource(content)

            if (/@(Controller|RestController)/i.test(content)) {
              findings.push(`controller: ${rel}`)
            }
            if (/@(Component|Service|Repository|Configuration)/i.test(content)) {
              findings.push(`bean: ${rel}`)
            }

            for (const match of content.matchAll(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g)) {
              const method = routeMethods[match[1]] ?? "ANY"
              const routePath = normalizePath(match[2] ?? "")
              const handler = `${klass}.${methodNameNear(content, match.index ?? 0)}(...)`
              findings.push(`route: ${method} ${routePath} -> ${handler} (${rel})`)
            }

            const inputPatterns = [
              "RequestParam",
              "PathVariable",
              "RequestBody",
              "CookieValue",
              "RequestHeader",
              "HttpServletRequest",
              "MultipartFile",
            ]
            for (const input of inputPatterns) {
              const re = new RegExp(`@?${input}(?:\\([^)]*\\))?\\s+(?:[\\w<>?, ]+\\s+)?(\\w+)?`, "g")
              for (const m of content.matchAll(re)) {
                const name = m[1] ?? "<unknown>"
                findings.push(`input: @${input} ${name} in ${klass}.${methodNameNear(content, m.index ?? 0)} (${rel})`)
              }
            }

            if (/extends OncePerRequestFilter|implements Filter|@WebFilter/i.test(content)) findings.push(`filter: ${rel}`)
            if (/HandlerInterceptor|addInterceptors/i.test(content)) findings.push(`interceptor: ${rel}`)
            if (/@EnableWebSecurity|SecurityConfig|configure\(HttpSecurity/i.test(content)) findings.push(`security-config: ${rel}`)
            if (/ObjectInputStream|readObject|readUnshared|readExternal/i.test(content)) findings.push(`deser-sink: ${rel}`)
            if (/Runtime\.exec|ProcessBuilder|Process\.start/i.test(content)) findings.push(`command-sink: ${rel}`)
            if (/DocumentBuilder|SAXParser|XMLReader|TransformerFactory|SAXTransformerFactory/i.test(content)) findings.push(`xxe-candidate: ${rel}`)
            if (/(File\(|FileInputStream|FileOutputStream|FileReader|FileWriter|Path\.get|Paths\.get|Resource\()/i.test(content)) findings.push(`file-sink: ${rel}`)
            if (/(RestTemplate|HttpClient|URL\(|openConnection|OkHttpClient)/i.test(content)) findings.push(`ssrf-candidate: ${rel}`)
            if ((/\$\{|#{/).test(content) && /(select|update|insert|delete|from\s+)/i.test(content)) findings.push(`sql-sink: ${rel}`)
            if (/Statement\.|PreparedStatement\.|createQuery\(|createNativeQuery\(|JdbcTemplate/i.test(content)) findings.push(`sql-sink: ${rel}`)
            if (/SpringBootApplication/i.test(content)) findings.push(`framework: Spring Boot main class: ${rel}`)
            if (/web\.xml$/i.test(rel)) findings.push(`config: servlet web.xml: ${rel}`)
            if (/application\.(properties|yml|yaml)$/i.test(rel)) findings.push(`config: ${rel}`)

            if (/pom\.xml$/i.test(rel) || /build\.gradle$/i.test(rel)) {
              findings.push(`build: ${rel}`)
              for (const dep of dependencyNames) {
                if (content.toLowerCase().includes(dep.toLowerCase())) {
                  const version = /pom\.xml$/i.test(rel) ? extractXmlVersion(content, dep) : extractGradleVersion(content, dep)
                  findings.push(`dependency-of-interest: ${dep} version=${version} (${rel})`)
                }
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    try {
      await walk(root)
    } catch (err) {
      return `Java map failed: ${err}`
    }

    return findings.length ? findings.join("\n") : "no Java findings"
  },
})
