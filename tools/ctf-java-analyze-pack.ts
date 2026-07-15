import { tool } from "@opencode-ai/plugin"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

type Hit = { file: string; kind: string; signal: string; score: number }

async function walk(root: string, limit: number, out: string[] = []) {
  if (out.length >= limit) return out
  let entries: { name: string; isDirectory(): boolean }[] = []
  try { entries = await readdir(root, { withFileTypes: true }) as unknown as { name: string; isDirectory(): boolean }[] } catch { return out }
  for (const entry of entries) {
    if (out.length >= limit) break
    const p = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (/^(node_modules|\.git|target|build|dist|out|BOOT-INF\/lib|WEB-INF\/lib)$/i.test(entry.name)) continue
      await walk(p, limit, out)
    } else out.push(p)
  }
  return out
}

function rel(base: string, file: string) { return path.relative(base, file).replace(/\\/g, "/") || file }
function uniq<T>(items: T[], limit = 80) { return Array.from(new Set(items)).slice(0, limit) }
function contains(text: string, re: RegExp) { return re.test(text) }

async function readSmall(file: string, max = 180000) {
  try {
    const s = await stat(file)
    if (s.size > max) return ""
    return await readFile(file, "utf8")
  } catch { return "" }
}

function laneFor(files: string[], requested: string) {
  if (["source", "artifact", "bytecode"].includes(requested)) return requested
  const joined = files.join("\n")
  if (/\.(jar|war)$/i.test(joined) || /(^|\/)BOOT-INF\//.test(joined) || /(^|\/)WEB-INF\//.test(joined)) return "artifact"
  if (/\.class$/i.test(joined) && !/\.java$/i.test(joined)) return "bytecode"
  return "source"
}

function addSignal(hits: Hit[], file: string, text: string, kind: string, signal: string, re: RegExp, score: number) {
  if (contains(text, re)) hits.push({ file, kind, signal, score })
}

export default tool({
  description: "CTF Java analyze macro pack: source/artifact/bytecode first-pass classifier, signal map, tool routing, and attack-queue seed.",
  args: {
    target: tool.schema.string().describe("Workspace-relative Java source/archive/extracted root or file."),
    lane: tool.schema.string().optional().describe("auto | source | artifact | bytecode. Default auto."),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 260, hard cap 800."),
  },
  async execute(args, context) {
    const base = path.resolve(context.directory)
    const target = path.resolve(base, args.target || ".")
    if (path.relative(base, target).startsWith("..")) throw new Error("target must stay inside workspace")
    const maxFiles = Math.max(30, Math.min(args.maxFiles ?? 260, 800))
    const s = await stat(target)
    const files = s.isDirectory() ? await walk(target, maxFiles) : [target]
    const lane = laneFor(files.map((f) => rel(target, f)), (args.lane || "auto").toLowerCase())
    const relFiles = files.map((f) => rel(target, f))
    const interesting = files.filter((f) => /\.(java|jsp|xml|properties|yml|yaml|gradle|pom|MF|class)$/i.test(f) || /pom\.xml|build\.gradle|web\.xml|application\.|shiro\.ini|MANIFEST\.MF/i.test(f)).slice(0, 220)
    const hits: Hit[] = []
    for (const file of interesting) {
      const text = await readSmall(file)
      const r = rel(target, file)
      const nameText = `${r}\n${text}`
      addSignal(hits, r, nameText, "control-plane", "Swagger/OpenAPI", /swagger|openapi|springfox|knife4j|ApiOperation/i, 90)
      addSignal(hits, r, nameText, "control-plane", "Actuator/H2/Druid", /actuator|management\.endpoints|h2-console|jdbc:h2|druid/i, 88)
      addSignal(hits, r, nameText, "route", "Spring/Servlet route", /@(RequestMapping|GetMapping|PostMapping)|<servlet|@WebServlet|extends\s+HttpServlet/i, 82)
      addSignal(hits, r, nameText, "auth", "filter/security boundary", /SecurityFilterChain|WebSecurityConfigurer|HandlerInterceptor|OncePerRequestFilter|FilterChain|ShiroFilter|antMatchers|requestMatchers|hasRole|permitAll/i, 78)
      addSignal(hits, r, nameText, "deser", "Java deserialization/parser", /ObjectInputStream|readObject\s*\(|XMLDecoder|parseObject|enableDefaultTyping|activateDefaultTyping|XStream|Yaml\s*\(/i, 86)
      addSignal(hits, r, nameText, "sql", "SQL/MyBatis raw construction", /\$\{|Statement\s*\.|createNativeQuery|@Select|@Update|@Insert|@Delete|jdbcTemplate\.query|ORDER BY \$|LIKE \$|mybatis/i, 80)
      addSignal(hits, r, nameText, "file", "file read/write/upload", /MultipartFile|transferTo|FileInputStream|FileOutputStream|Files\.(read|write)|Paths\.get|ResourceUtils|getRealPath|sendRedirect/i, 80)
      addSignal(hits, r, nameText, "template", "template/expression", /Thymeleaf|Freemarker|FreeMarker|Velocity|SpelExpressionParser|ExpressionParser|setViewName|ModelAndView/i, 78)
      addSignal(hits, r, nameText, "xxe-ssrf", "XML/SSRF/fetcher", /DocumentBuilderFactory|SAXParserFactory|XMLInputFactory|TransformerFactory|RestTemplate|HttpClient|URL\(|openConnection|WorkbookFactory|XSSFWorkbook/i, 76)
      addSignal(hits, r, nameText, "config", "secret/config/route clue", /password|secret|token|key|flag|upload|admin|context-path|server\.servlet|spring\.mvc/i, 72)
    }
    const ranked = hits.sort((a, b) => b.score - a.score).slice(0, 24)
    const recommended = [
      lane === "artifact" ? "ctf-java-archive-map before extraction; then ctf-safe-extract and config/bytecode tools" : "",
      lane === "bytecode" ? "ctf-java-bytecode-hints then selective ctf-java-decompile-targets" : "",
      ranked.some((h) => h.kind === "config" || h.kind === "control-plane") ? "ctf-java-config-map on target/config files" : "",
      ranked.some((h) => ["route", "auth", "sql", "file", "template", "xxe-ssrf", "deser"].includes(h.kind)) ? "ctf-java-source-slice focused on top route/sink signal" : "",
      ranked.length ? "ctf-java-chain-planner with this attack_queue_seed" : "ctf-java-map or archive/config map for deeper evidence",
    ].filter(Boolean)
    return [
      "# CTF Java Analyze Pack",
      `target: ${rel(base, target)}`,
      `lane: ${lane}`,
      `files_seen: ${files.length}`,
      `interesting_files: ${interesting.length}`,
      `next_tool: ${recommended[0] ?? "ctf-java-map"}`,
      "layout_signals:",
      `- build_files: ${uniq(relFiles.filter((f) => /pom\.xml|build\.gradle|settings\.gradle/i.test(f)), 30).join(" | ") || "none"}`,
      `- web_layout: ${uniq(relFiles.filter((f) => /WEB-INF|BOOT-INF|web\.xml|application\.(properties|yml|yaml)|shiro\.ini/i.test(f)), 40).join(" | ") || "none"}`,
      `- classes: ${relFiles.filter((f) => /\.class$/i.test(f)).length}`,
      `- java_sources: ${relFiles.filter((f) => /\.java$/i.test(f)).length}`,
      "attack_queue_seed:",
      ...(ranked.length ? ranked.map((h, i) => `- #${i + 1} score=${h.score} kind=${h.kind} file=${h.file} signal=${h.signal}`) : ["- none"]),
      "recommended_next:",
      ...(recommended.length ? recommended.map((x) => `- ${x}`) : ["- provide extracted/source target or run ctf-java-archive-map on JAR/WAR"]),
      "decision_contract:",
      "- Promote at most top three source-backed signals to ctf-decision-state.",
      "- Dependency/gadget branches require route, config, data-shape, classpath, and oracle gates.",
      "- WEB-INF/web.xml, Swagger, Actuator, H2, deserialization, and source-proven sinks outrank black-box guessing.",
    ].join("\n")
  },
})
