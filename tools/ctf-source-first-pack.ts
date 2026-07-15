import { tool } from "@opencode-ai/plugin"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

type Hit = { file: string; family: string; evidence: string; score: number }

async function walk(root: string, limit: number, out: string[] = []) {
  if (out.length >= limit) return out
  let entries: { name: string; isDirectory(): boolean }[] = []
  try { entries = await readdir(root, { withFileTypes: true }) as unknown as { name: string; isDirectory(): boolean }[] } catch { return out }
  for (const e of entries) {
    if (out.length >= limit) break
    const p = path.join(root, e.name)
    if (e.isDirectory()) {
      if (/^(node_modules|\.git|vendor|target|build|dist|coverage|__pycache__)$/i.test(e.name)) continue
      await walk(p, limit, out)
    } else out.push(p)
  }
  return out
}

function rel(base: string, file: string) { return path.relative(base, file).replace(/\\/g, "/") || file }
async function readSmall(file: string) { try { const s = await stat(file); return s.size > 180000 ? "" : await readFile(file, "utf8") } catch { return "" } }
function add(hits: Hit[], file: string, text: string, family: string, evidence: string, re: RegExp, score: number) { if (re.test(text)) hits.push({ file, family, evidence, score }) }
function uniq<T>(xs: T[], n = 80) { return Array.from(new Set(xs)).slice(0, n) }

export default tool({
  description: "CTF source-first macro pack: compact source/config/dependency inventory, sink-family map, owner guess, and first safe audit route.",
  args: {
    target: tool.schema.string().optional().describe("Workspace-relative source/leak root. Default current workspace."),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 320, hard cap 1000."),
  },
  async execute(args, context) {
    const base = path.resolve(context.directory)
    const target = path.resolve(base, args.target || ".")
    if (path.relative(base, target).startsWith("..")) throw new Error("target must stay inside workspace")
    const files = await walk(target, Math.max(40, Math.min(args.maxFiles ?? 320, 1000)))
    const rels = files.map((f) => rel(target, f))
    const textFiles = files.filter((f) => /\.(js|ts|tsx|py|php|java|jsp|go|rb|rs|cs|xml|json|yml|yaml|properties|env|ini|conf|sql|gradle|pom|Dockerfile)$/i.test(f) || /Dockerfile|pom\.xml|package\.json|requirements\.txt|go\.mod|composer\.json|Gemfile/i.test(f)).slice(0, 260)
    const hits: Hit[] = []
    for (const f of textFiles) {
      const text = await readSmall(f)
      const r = rel(target, f)
      const both = `${r}\n${text}`
      add(hits, r, both, "route", "route/controller/API declaration", /app\.(get|post|put|delete)|router\.|@RequestMapping|@GetMapping|@PostMapping|Route\(|@app\.route|fastapi|express|Controller|Servlet/i, 80)
      add(hits, r, both, "auth", "auth/session/role boundary", /auth|login|session|jwt|role|admin|isAdmin|permission|csrf|xsrf|shiro|SecurityFilter/i, 76)
      add(hits, r, both, "file", "file/path/upload/archive sink", /readFile|writeFile|FileInputStream|FileOutputStream|open\(|send_file|file_get_contents|include\(|MultipartFile|multer|ZipInputStream|tarfile/i, 82)
      add(hits, r, both, "sql", "SQL/NoSQL construction", /SELECT .*\+|execute\(|query\(|createQuery|Statement|\$where|\$ne|sequelize\.query|mysql|sqlite|postgres/i, 78)
      add(hits, r, both, "template-code", "template/code execution sink", /eval\(|exec\(|Function\(|render_template_string|SSTI|SpelExpressionParser|Runtime\.exec|ProcessBuilder|child_process|system\(/i, 86)
      add(hits, r, both, "ssrf", "network fetcher/redirect", /requests\.|fetch\(|axios\.|RestTemplate|HttpClient|URL\(|curl|redirect|webhook|callback|openConnection/i, 74)
      add(hits, r, both, "deser", "deserialization/parser", /pickle\.loads|unserialize|ObjectInputStream|readObject|JSON\.parse|yaml\.load|XStream|Fastjson|node-serialize/i, 84)
      add(hits, r, both, "config-secret", "config/secret/control-plane", /password|secret|token|api[_-]?key|flag|actuator|swagger|openapi|h2-console|debug/i, 88)
    }
    const ranked = hits.sort((a, b) => b.score - a.score).slice(0, 30)
    const langs = [
      ["Java", /\.java$|\.jsp$|pom\.xml|build\.gradle/i], ["Node", /\.js$|\.ts$|package\.json/i], ["Python", /\.py$|requirements\.txt|pyproject\.toml/i],
      ["PHP", /\.php$|composer\.json/i], ["Go", /\.go$|go\.mod/i], ["Ruby", /\.rb$|Gemfile/i], ["Docker", /Dockerfile|docker-compose/i],
    ].filter(([, re]) => rels.some((x) => (re as RegExp).test(x))).map(([name]) => name)
    const nextTool = langs.includes("Java") ? "ctf-java-analyze-pack" : ranked.length ? "ctf-whitebox-handoff" : "ctf-one-shot-triage"
    return [
      "# CTF Source First Pack",
      `target: ${rel(base, target)}`,
      `files_seen: ${files.length}`,
      `text_files_inspected: ${textFiles.length}`,
      `languages_stack: ${langs.join(", ") || "unknown"}`,
      `next_tool: ${nextTool}`,
      "dependency_config_files:",
      ...(uniq(rels.filter((x) => /package\.json|pom\.xml|build\.gradle|requirements\.txt|pyproject|go\.mod|composer\.json|Gemfile|Dockerfile|docker-compose|application\.|\.env|config/i.test(x)), 80).map((x) => `- ${x}`) || ["- none"]),
      "source_signal_queue:",
      ...(ranked.length ? ranked.map((h, i) => `- #${i + 1} score=${h.score} family=${h.family} file=${h.file} evidence=${h.evidence}`) : ["- none"]),
      "recommended_next:",
      `- ${nextTool}`,
      "- Update ctf-whitebox-handoff with entrypoints/sinks/auth facts before remote guessing.",
      "- Promote at most three source-backed hypotheses into ctf-decision-state.",
      "- Stop broad scanning once a direct flag/config/source/admin primitive appears.",
    ].join("\n")
  },
})
