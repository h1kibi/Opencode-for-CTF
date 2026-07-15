import { tool } from "@opencode-ai/plugin"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

const sourceRe = /\.(java|jsp|xml|properties|yml|yaml)$/i
const routeRe = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping|WebServlet)\b/i
const inputRe = /@(RequestParam|PathVariable|RequestBody|RequestHeader|CookieValue|ModelAttribute)|HttpServletRequest|MultipartFile|Part\b|getParameter\(|getHeader\(|getCookies\(/i
const sinkFamilies: { name: string; re: RegExp; reference: string }[] = [
  { name: "sql", re: /\$\{|Statement\.|PreparedStatement\.|JdbcTemplate|createQuery\(|createNativeQuery\(|@Select\(|@Update\(|@Insert\(|@Delete\(/i, reference: "java-sql-mybatis.md" },
  { name: "file-upload-path", re: /FileInputStream|FileOutputStream|Files\.read|Files\.write|Paths\.get|Path\.of|MultipartFile|transferTo\(|ZipInputStream|ZipEntry|ClassPathResource|ServletContext\.getResource|getRealPath/i, reference: "java-file-upload-path.md" },
  { name: "template-expression", re: /TemplateEngine|FreeMarker|Freemarker|VelocityEngine|ExpressionParser|SpelExpressionParser|Ognl|ModelAndView|setViewName|InternalResourceViewResolver|\.ftl|\.vm|\.jsp/i, reference: "java-template-expression.md" },
  { name: "deser-parser", re: /ObjectInputStream|readObject|XMLDecoder|JSON\.parseObject|parseObject\(|ObjectMapper|enableDefaultTyping|activateDefaultTyping|new\s+Yaml\(|XStream/i, reference: "java-deser-shiro-fastjson.md" },
  { name: "xxe", re: /DocumentBuilderFactory|SAXParserFactory|XMLInputFactory|SAXReader|TransformerFactory|setFeature\(/i, reference: "java-xxe-ssrf.md" },
  { name: "ssrf", re: /RestTemplate|HttpClient|WebClient|OkHttpClient|URL\(|URI\(|openConnection/i, reference: "java-xxe-ssrf.md" },
  { name: "command", re: /Runtime\.exec|ProcessBuilder|Process\.start/i, reference: "spring-boot-source-map.md" },
]

function className(content: string) {
  return content.match(/class\s+(\w+)/)?.[1] ?? content.match(/interface\s+(\w+)/)?.[1] ?? "<unknown>"
}

function methodAt(content: string, index: number) {
  const before = content.slice(Math.max(0, index - 1200), index + 1200)
  const matches = Array.from(before.matchAll(/(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\], ?]+\s+(\w+)\s*\([^)]*\)/g))
  return matches.length ? matches[matches.length - 1][1] : "<unknown-method>"
}

function snippet(content: string, index: number) {
  const lines = content.split(/\r?\n/)
  let pos = 0
  let lineNo = 0
  for (let i = 0; i < lines.length; i++) {
    pos += lines[i].length + 1
    if (pos >= index) { lineNo = i; break }
  }
  const start = Math.max(0, lineNo - 3)
  const end = Math.min(lines.length, lineNo + 4)
  return lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line.trim()}`).join("\n")
}

export default tool({
  description: "CTF Java source slice: scan Java/JSP/XML source for route/input/sink co-location, source-to-sink slices, reference dispatch, and first safe checks for Java Web challenges.",
  args: {
    target: tool.schema.string().describe("Java Web source/extracted directory to slice"),
    focus: tool.schema.string().optional().describe("Optional focus keyword such as route path, class, sink family, parameter, or dependency clue"),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const root = resolveInsideWorkspace(context.directory, args.target)
    const focus = args.focus?.toLowerCase()
    const files: string[] = []
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory() && ![".git", "node_modules", "target", "build"].includes(e.name)) await walk(p)
        else if (e.isFile() && sourceRe.test(e.name)) files.push(p)
      }
    }
    await walk(root)

    const routes: string[] = []
    const inputs: string[] = []
    const sinks: string[] = []
    const slices: string[] = []
    const xrefs: string[] = []
    const refs = new Set<string>()

    for (const file of files.slice(0, 800)) {
      let content = ""
      try { content = await fs.readFile(file, "utf8") } catch { continue }
      const rel = path.relative(root, file).replace(/\\/g, "/")
      if (focus && !rel.toLowerCase().includes(focus) && !content.toLowerCase().includes(focus)) continue
      const cls = className(content)
      if (routeRe.test(content)) routes.push(`route-file: ${rel} class=${cls}`)
      if (inputRe.test(content)) inputs.push(`input-file: ${rel} class=${cls}`)
      const injected = Array.from(content.matchAll(/(?:@Autowired\s+|private\s+final\s+|private\s+)([A-Z]\w*(?:Service|Mapper|Repository|Dao|DAO|Client|Util|Helper))\s+(\w+)/g)).slice(0, 20)
      for (const m of injected) xrefs.push(`xref-field: ${rel} class=${cls} type=${m[1]} name=${m[2]}`)
      const calls = Array.from(content.matchAll(/\b(\w+)\.(\w+)\s*\(/g)).filter((m) => !["System", "String", "Math", "Objects", "Collections", "Arrays"].includes(m[1])).slice(0, 40)
      for (const m of calls) xrefs.push(`xref-call: ${rel} class=${cls} ${m[1]}.${m[2]}(...)`)
      if (/namespace\s*=|<mapper\b|@(Mapper|Repository)\b/i.test(content)) xrefs.push(`xref-mapper: ${rel} class=${cls}`)
      for (const fam of sinkFamilies) {
        const matches = Array.from(content.matchAll(new RegExp(fam.re.source, "ig"))).slice(0, 12)
        if (!matches.length) continue
        refs.add(fam.reference)
        sinks.push(`sink: ${fam.name} ${rel} class=${cls} hits=${matches.length} reference=${fam.reference}`)
        for (const m of matches.slice(0, 3)) {
          const idx = m.index ?? 0
          slices.push([
            `slice: ${fam.name} ${rel} ${cls}.${methodAt(content, idx)} reference=${fam.reference}`,
            snippet(content, idx),
          ].join("\n"))
        }
      }
    }

    const queue: string[] = []
    if (routes.length && sinks.length) queue.push("Route/input/sink evidence exists: build Java Constraint Equation and choose the highest-value co-located or xref-able sink")
    if (sinks.some((x) => x.includes("sql"))) queue.push("SQL/MyBatis: inspect mapper/service reachability and binding type before payloads")
    if (sinks.some((x) => x.includes("file-upload-path"))) queue.push("File/upload/path: map base dir, normalization, extension checks, canary behavior")
    if (sinks.some((x) => x.includes("template-expression"))) queue.push("Template/expression: identify engine and context before expression marker")
    if (sinks.some((x) => x.includes("deser-parser"))) queue.push("Deser/parser: verify parser/config/data shape before gadgets")
    if (sinks.some((x) => x.includes("xxe") || x.includes("ssrf"))) queue.push("XXE/SSRF: identify parser/fetcher and validator before one safe differential")
    if (!queue.length) queue.push("No strong slice found; run ctf-java-map/config/dep-risk or focus on a route/sink keyword")

    return [
      "# Java Source Slice",
      `target: ${root}`,
      `files_scanned: ${files.length}`,
      `focus: ${args.focus ?? "<none>"}`,
      "",
      "## Route Files",
      ...(routes.length ? routes.slice(0, 120).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Input Files",
      ...(inputs.length ? inputs.slice(0, 120).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Sink Files",
      ...(sinks.length ? sinks.slice(0, 160).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Source Slices",
      ...(slices.length ? slices.slice(0, 80) : ["- none"]),
      "",
      "## Service / Mapper Xrefs",
      ...(xrefs.length ? xrefs.slice(0, 160).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Reference Dispatch",
      ...(refs.size ? Array.from(refs).map((x) => `- ${x}`) : ["- none"]),
      "",
      "## Attack Queue Seed",
      ...queue.map((x, i) => `${i + 1}. ${x}`),
      "",
      "## First Safe Checks",
      "- For the top sink, prove route reachability and controlled parameter before payloads.",
      "- If route and sink are in different files, trace controller -> service -> mapper/helper by method/class names.",
      "- Load the referenced Java Web reference before exploit probes.",
    ].join("\n")
  },
})
