import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "CTF Java web map: scan source directories for framework, routes, controllers, filters, interceptors, security config, dependencies, dangerous sinks, template engines, deserialization libs, XXE parsers, file sinks, SSRF sinks, and SQL sinks.",
  args: {
    dir: tool.schema.string().describe("Directory containing Java source"),
  },
  async execute(args) {
    const fs = await import("fs/promises")
    const path = await import("path")
    const findings: string[] = []

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const p = path.join(dir, e.name)
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
          await walk(p)
        } else if (e.isFile() && /\.(java|xml|yml|yaml|properties|gradle|mf)$/i.test(e.name)) {
          try {
            const content = await fs.readFile(p, "utf8")
            const rel = p.replace(args.dir.replace(/\\/g, "/"), "").replace(/^[\\/]/, "")

            if (/@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)/i.test(content)) {
              findings.push(`route: ${rel}`)
            }
            if (/@(Controller|RestController)/i.test(content)) {
              findings.push(`controller: ${rel}`)
            }
            if (/@(Component|Service|Repository|Configuration)/i.test(content)) {
              findings.push(`bean: ${rel}`)
            }
            if (/extends OncePerRequestFilter|implements Filter|@WebFilter/i.test(content)) {
              findings.push(`filter: ${rel}`)
            }
            if (/HandlerInterceptor|addInterceptors/i.test(content)) {
              findings.push(`interceptor: ${rel}`)
            }
            if (/@EnableWebSecurity|SecurityConfig|configure\(HttpSecurity/i.test(content)) {
              findings.push(`security-config: ${rel}`)
            }
            if (/ObjectInputStream|readObject|readUnshared|readExternal/i.test(content)) {
              findings.push(`deser-sink: ${rel}`)
            }
            if (/Runtime\.exec|ProcessBuilder|Process\.start/i.test(content)) {
              findings.push(`command-sink: ${rel}`)
            }
            if (/DocumentBuilder|SAXParser|XMLReader|TransformerFactory|SAXTransformerFactory/i.test(content)) {
              findings.push(`xxe-candidate: ${rel}`)
            }
            if (/(File\(|FileInputStream|FileOutputStream|FileReader|FileWriter|Path\.get|Paths\.get|Resource\()/i.test(content)) {
              findings.push(`file-sink: ${rel}`)
            }
            if (/(RestTemplate|HttpClient|URL\(|openConnection|OkHttpClient)/i.test(content)) {
              findings.push(`ssrf-candidate: ${rel}`)
            }
            if ((/\$\{|#{/).test(content) && /(select|update|insert|delete|from\s+)/i.test(content)) {
              findings.push(`sql-sink: ${rel}`)
            }
            if (/Statement\.|PreparedStatement\.|createQuery\(|createNativeQuery\(|JdbcTemplate/i.test(content)) {
              findings.push(`sql-sink: ${rel}`)
            }
            if (/SpringBootApplication/i.test(content)) {
              findings.push(`framework: Spring Boot main class: ${rel}`)
            }
            if (/pom\.xml$/i.test(rel) || /build\.gradle$/i.test(rel)) {
              findings.push(`build: ${rel}`)
              const deps = content.match(/(?:groupId|artifactId|version)>([^<]+)</g)
              if (deps) findings.push(`  deps: ${deps.map((d: string) => d.replace(/[<>]/g, " ").trim()).join("; ").slice(0, 500)}`)
            }
            if (/application\.(properties|yml|yaml)$/i.test(rel)) {
              findings.push(`config: ${rel}`)
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    try {
      await walk(args.dir)
    } catch (err) {
      return `Java map failed: ${err}`
    }

    return findings.length ? findings.join("\n") : "no Java findings"
  },
})
