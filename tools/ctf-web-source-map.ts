import { tool } from "@opencode-ai/plugin"
import { lstat, readdir, readFile } from "node:fs/promises"
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

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "__pycache__",
  "venv",
  ".venv",
  "target",
  ".cache",
])
const SOURCE_EXT =
  /\.(py|js|mjs|cjs|ts|tsx|jsx|php|java|kt|go|rb|rs|html|hbs|ejs|jinja|twig|jsp|xml|json|ya?ml|toml|ini|properties|env|conf|cfg)$/i
const MANIFEST =
  /(^|[\\/])(package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|composer\.json|cargo\.toml|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|\.env(\.example|\.sample)?|config\.(js|ts|json|php|py|ya?ml))$/i
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

const ROUTE_PATTERNS: Array<[string, RegExp]> = [
  ["flask/django/fastapi", /@(?:app|bp|router)\.(?:route|get|post|put|delete|patch)\(["'`]([^"'`]+)["'`]/g],
  ["fastapi-router", /APIRouter\([^)]*\)|include_router\(/g],
  ["express", /\b(?:app|router)\.(?:get|post|put|delete|patch|all|use)\(\s*["'`]([^"'`]+)["'`]/g],
  ["php", /\$_(?:GET|POST|REQUEST|COOKIE|FILES)\[["'`]([^"'`]+)["'`]\]/g],
  ["laravel", /Route::(?:get|post|put|delete|patch|any)\(\s*["'`]([^"'`]+)["'`]/g],
  [
    "spring",
    /@(GetMapping|PostMapping|RequestMapping|PutMapping|DeleteMapping)\((?:value\s*=\s*)?["'`]([^"'`]+)["'`]/g,
  ],
  ["go-http", /http\.HandleFunc\(\s*["'`]([^"'`]+)["'`]/g],
]

const INPUT_PATTERNS: Array<[string, RegExp]> = [
  ["python request args/form/json/files/cookies", /request\.(args|form|json|files|cookies|headers|values|get_json)/g],
  [
    "node req query/body/params/cookies/files/headers",
    /req\.(query|body|params|cookies|files|headers)|request\.(query|body|params)/g,
  ],
  ["php superglobal", /\$_(GET|POST|REQUEST|COOKIE|FILES|SERVER)\[/g],
  [
    "java request param/header/session",
    /getParameter\(|getHeader\(|getSession\(|@RequestParam|@RequestBody|@PathVariable/g,
  ],
  ["go request", /r\.(URL|Form|PostForm|MultipartForm|Header|Cookie)|FormValue\(|PostFormValue\(/g],
]

const SINK_PATTERNS: Array<[string, RegExp]> = [
  [
    "command execution",
    /\b(eval|exec|system|popen|shell_exec|passthru|subprocess\.|os\.system|child_process|execSync|spawn\(|ProcessBuilder|Runtime\.getRuntime|Command::new)\b/g,
  ],
  [
    "template injection",
    /render_template_string|Template\(|jinja2|twig|handlebars|ejs\.render|pug\.render|res\.render/g,
  ],
  [
    "SQL/string query",
    /\b(select|insert|update|delete)\b[\s\S]{0,80}(\+|%|format\(|f["'`]|\$\{|\.format)|execute\([^,)]*\+|rawQuery|createQuery|Statement\./gi,
  ],
  [
    "deserialization",
    /pickle\.loads|yaml\.load|unserialize\(|ObjectInputStream|readObject\(|JSON\.parse\(|marshal\.loads|phpggc/g,
  ],
  [
    "file/path",
    /readFile|writeFile|createReadStream|send_file|open\(|FileInputStream|Files\.read|Path\.join|\.\.[\\/]|download|upload|move_uploaded_file/g,
  ],
  ["ssrf/url fetch", /requests\.|urllib|curl|fetch\(|axios\.|http\.get|URL\(|openConnection\(|RestTemplate/g],
  ["jwt/session/crypto", /jwt|jsonwebtoken|SECRET_KEY|secret_key|session|cookie|sign\(|verify\(|HS256|RS256/g],
]

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  [
    "hardcoded secret/env",
    /(SECRET_KEY|JWT_SECRET|API_KEY|TOKEN|PASSWORD|PASSWD|FLAG|PRIVATE_KEY|SESSION_SECRET)\s*[:=]\s*["'`]?([^"'`\n#]+)/gi,
  ],
  ["flag-like", FLAG_RE],
  ["debug mode", /debug\s*[:=]\s*(true|1)|DEBUG\s*=\s*(true|1)/gi],
]

type SourceFile = { file: string; rel: string; score: number; text: string }

function scoreRel(rel: string) {
  const base = path.basename(rel)
  let score = 0
  if (MANIFEST.test(rel)) score += 30
  if (/^(app|main|server|index|manage|settings|config)\./i.test(base)) score += 22
  if (/routes?|controllers?|views?|templates?|api|auth|admin|upload|flag|debug|bot/i.test(rel)) score += 16
  if (SOURCE_EXT.test(base)) score += 5
  score -= Math.max(0, rel.split(/[\\/]+/).length - 3) * 2
  return score
}

async function walk(root: string, base = root, out: string[] = [], max = 1500) {
  if (out.length >= max) return out
  const stat = await lstat(root)
  if (stat.isFile()) {
    const rel = path.relative(base, root) || path.basename(root)
    if (SOURCE_EXT.test(rel) || MANIFEST.test(rel)) out.push(root)
    return out
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return out
  const entries = await readdir(root, { withFileTypes: true })
  entries.sort((a, b) => {
    const ar = path.relative(base, path.join(root, a.name)) || a.name
    const br = path.relative(base, path.join(root, b.name)) || b.name
    return scoreRel(br) - scoreRel(ar) || a.name.localeCompare(b.name)
  })
  for (const entry of entries) {
    if (out.length >= max) break
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue
    await walk(path.join(root, entry.name), base, out, max)
  }
  return out
}

function detectFramework(files: SourceFile[]) {
  const blob = files
    .map((f) => `${f.rel}\n${f.text.slice(0, 3000)}`)
    .join("\n")
    .toLowerCase()
  const hits: string[] = []
  if (/flask|@app\.route|requirements\.txt/.test(blob)) hits.push("Flask/Python")
  if (/django|settings\.py|urls\.py|manage\.py/.test(blob)) hits.push("Django/Python")
  if (/fastapi|apirouter|uvicorn/.test(blob)) hits.push("FastAPI/Python")
  if (/express|package\.json|router\.get|app\.post/.test(blob)) hits.push("Express/Node")
  if (/next\/|next\.config|pages\/api|app\/api/.test(blob)) hits.push("Next.js")
  if (/laravel|artisan|route::|composer\.json/.test(blob)) hits.push("Laravel/PHP")
  if (/spring-boot|@requestmapping|@getmapping|pom\.xml|build\.gradle/.test(blob)) hits.push("Spring/Java")
  if (/http\.handlefunc|gin\.default|go\.mod/.test(blob)) hits.push("Go HTTP")
  if (/actix|rocket|cargo\.toml/.test(blob)) hits.push("Rust Web")
  return hits.length ? hits : ["unknown/mixed"]
}

function collectMatches(files: SourceFile[], patterns: Array<[string, RegExp]>, limit = 120) {
  const hits: string[] = []
  for (const f of files) {
    for (const [name, re] of patterns) {
      re.lastIndex = 0
      for (const m of f.text.matchAll(re)) {
        const val = (m[2] ?? m[1] ?? m[0]).toString().replace(/\s+/g, " ").slice(0, 160)
        hits.push(`${f.rel}: ${name}: ${val}`)
        if (hits.length >= limit) return hits
      }
    }
  }
  return hits
}

function recommend(routeHits: string[], inputHits: string[], sinkHits: string[], secretHits: string[]) {
  const joined =
    `${routeHits.join("\n")}\n${inputHits.join("\n")}\n${sinkHits.join("\n")}\n${secretHits.join("\n")}`.toLowerCase()
  const out: string[] = []
  if (/flag-like|flag\{|hardcoded secret|secret_key|jwt_secret/.test(joined))
    out.push("verify exposed flag/secret first; this is usually faster than exploitation")
  if (/template injection|render_template_string|ejs\.render|twig/.test(joined))
    out.push("test SSTI with one low-risk arithmetic payload")
  if (/sql\/string query|statement|rawquery|select/.test(joined)) out.push("test SQLi/auth bypass before full fuzzing")
  if (/command execution|subprocess|child_process|runtime\.getruntime|processbuilder/.test(joined))
    out.push("trace user input to command sink; prefer one controlled command proof")
  if (/deserialization|pickle|unserialize|objectinputstream|yaml\.load/.test(joined))
    out.push("inspect signing/secret and gadget surface before payload generation")
  if (/file\/path|upload|download|send_file|readfile|writefile/.test(joined))
    out.push("check path traversal/upload/file-write matrix before brute forcing")
  if (/ssrf|url fetch|requests\.|axios|fetch\(/.test(joined))
    out.push("check SSRF/internal route path if user controls URL")
  if (/jwt|session|cookie/.test(joined)) out.push("inspect JWT/session secret, algorithm, and cookie trust boundary")
  if (!out.length) out.push("map route -> input -> sink for top 3 routes; avoid broad grep until entrypoints are read")
  return out.slice(0, 8)
}

export default tool({
  description:
    "CTF web source map: compact static route/input/sink/secret map for source-code Web challenges before manual review or fuzzing.",
  args: {
    target: tool.schema.string().default(".").describe("Source tree or file to map"),
    maxFiles: tool.schema.number().optional().describe("Maximum source files to inspect. Default 180."),
    maxBytesPerFile: tool.schema.number().optional().describe("Maximum bytes per file. Default 160000."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const maxFiles = Math.max(10, Math.min(args.maxFiles ?? 180, 700))
    const maxBytesPerFile = Math.max(20000, Math.min(args.maxBytesPerFile ?? 160000, 1000000))
    const filePaths = (await walk(target, target, [], Math.max(maxFiles * 5, 600)))
      .map((file) => ({ file, rel: path.relative(target, file) || path.basename(file) }))
      .sort((a, b) => scoreRel(b.rel) - scoreRel(a.rel) || a.rel.localeCompare(b.rel))
      .slice(0, maxFiles)

    const files: SourceFile[] = []
    for (const f of filePaths) {
      try {
        const buf = await readFile(f.file)
        files.push({
          file: f.file,
          rel: f.rel,
          score: scoreRel(f.rel),
          text: buf.subarray(0, maxBytesPerFile).toString("utf8"),
        })
      } catch {
        // ignore unreadable files
      }
    }

    const frameworks = detectFramework(files)
    const manifests = files
      .filter((f) => MANIFEST.test(f.rel))
      .slice(0, 30)
      .map((f) => f.rel)
    const entrypoints = files
      .filter((f) => scoreRel(f.rel) >= 22 && !MANIFEST.test(f.rel))
      .slice(0, 40)
      .map((f) => f.rel)
    const routes = collectMatches(files, ROUTE_PATTERNS, 120)
    const inputs = collectMatches(files, INPUT_PATTERNS, 100)
    const sinks = collectMatches(files, SINK_PATTERNS, 120)
    const secrets = collectMatches(files, SECRET_PATTERNS, 80)
    const recommended = recommend(routes, inputs, sinks, secrets)

    return [
      `target: ${target}`,
      `files_inspected: ${files.length}`,
      `framework: ${frameworks.join(", ")}`,
      `verdict: ${secrets.length ? "direct_secret_or_flag" : "web_source"}`,
      `confidence: ${routes.length || sinks.length || secrets.length ? "high" : "medium"}`,
      `next_tool: none`,
      `next_target: ${path.basename(target) || "."}`,
      `spawn_subagent: ${routes.length || sinks.length || secrets.length ? "no" : "maybe"}`,
      `direct_solve: ${secrets.length ? "maybe" : "no"}`,
      "manifests_config:",
      ...(manifests.length ? manifests.map((x) => `- ${x}`) : ["- none"]),
      "entrypoints_high_value:",
      ...(entrypoints.length ? entrypoints.map((x) => `- ${x}`) : ["- none"]),
      "routes:",
      ...(routes.length ? routes.map((x) => `- ${x}`) : ["- none"]),
      "inputs:",
      ...(inputs.length ? inputs.map((x) => `- ${x}`) : ["- none"]),
      "sinks:",
      ...(sinks.length ? sinks.map((x) => `- ${x}`) : ["- none"]),
      "secrets_flags_debug:",
      ...(secrets.length ? secrets.map((x) => `- ${x}`) : ["- none"]),
      "recommended_first_attacks:",
      ...recommended.map((x) => `- ${x}`),
    ].join("\n")
  },
})
