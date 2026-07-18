import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, open, readdir, readFile, writeFile, lstat } from "node:fs/promises"
import path from "node:path"
import { resolveAllowedPath } from "./lib/path-policy.ts"
import { safeExec } from "./lib/exec-utils.ts"

const SAMPLE_BYTES = 1024 * 1024
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

type ArtifactKind = "source" | "elf" | "pe" | "apk" | "archive" | "pcap" | "image" | "audio" | "document" | "unknown"
type Language = "python" | "javascript" | "typescript" | "java" | "go" | "rust" | "cpp" | "c" | "php" | "ruby" | "wasm" | "unknown"

type AnalysisEntry = {
  kind: "source" | "sink" | "sanitizer" | "entrypoint" | "auth" | "secret" | "flag"
  name: string
  location?: { file: string; line?: number }
  detail?: string
}

type CallEdge = {
  from: { file: string; fn: string; line?: number }
  to: { file: string; fn: string }
}

type ArtifactDb = {
  slug: string
  target: string
  sha256: string
  size: number
  artifact: {
    kind: ArtifactKind
    language: Language
    hints: string[]
  }
  entries: AnalysisEntry[]
  calls: CallEdge[]
  createdAt: string
}

function log(...args: unknown[]) {
  console.log("[artifact-analyze]", ...args)
}

async function sha256File(target: string) {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(target)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve())
    stream.on("error", reject)
  })
  return hash.digest("hex")
}

async function readSample(target: string, maxBytes = SAMPLE_BYTES) {
  const fd = await open(target, "r")
  try {
    const buf = Buffer.alloc(maxBytes)
    const { bytesRead } = await fd.read(buf, 0, maxBytes, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fd.close()
  }
}

function entropy(buf: Buffer) {
  if (buf.length === 0) return 0
  const counts = new Array(256).fill(0)
  for (const byte of buf) counts[byte]++
  let result = 0
  for (const count of counts) {
    if (!count) continue
    const p = count / buf.length
    result -= p * Math.log2(p)
  }
  return result
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  return Array.from(text.matchAll(/[ -~]{5,}/g), (m) => m[0])
}

function detectLanguage(files: string[]): Language {
  const ext = new Set(files.map((f) => path.extname(f).toLowerCase()))
  if (ext.has(".py")) return "python"
  if (ext.has(".js")) return "javascript"
  if (ext.has(".ts") || ext.has(".tsx")) return "typescript"
  if (ext.has(".java") || ext.has(".jar") || ext.has(".class")) return "java"
  if (ext.has(".go")) return "go"
  if (ext.has(".rs")) return "rust"
  if (ext.has(".cpp") || ext.has(".cxx") || ext.has(".cc") || ext.has(".c")) return "cpp"
  if (ext.has(".php")) return "php"
  if (ext.has(".rb")) return "ruby"
  if (ext.has(".wasm") || ext.has(".wat")) return "wasm"
  return "unknown"
}

function detectArtifactKind(name: string, sample: Buffer, strings: string[]): { kind: ArtifactKind; hints: string[] } {
  const lower = name.toLowerCase()
  const joined = strings.join("\n").toLowerCase()
  const hints: string[] = []

  // ELF
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    hints.push("elf")
    if (/\b(x86_64|amd64|i386|aarch64|arm64|mips|riscv)\b/i.test(joined)) hints.push("cross-arch")
    return { kind: "elf", hints }
  }
  // PE
  if (sample.subarray(0, 2).toString() === "MZ") {
    hints.push("pe")
    return { kind: "pe", hints }
  }
  // APK / ZIP-alike
  if (sample.subarray(0, 2).toString() === "PK") {
    if (/\.apk$/i.test(lower) || /AndroidManifest/i.test(joined)) {
      hints.push("apk")
      return { kind: "apk", hints }
    }
    hints.push("archive")
    if (/classes\.dex/i.test(joined)) hints.push("dex")
    return { kind: "archive", hints }
  }
  // PCAP
  if (sample.subarray(0, 4).equals(Buffer.from([0xd4, 0xc3, 0xb2, 0xa1])) ||
      sample.subarray(0, 4).equals(Buffer.from([0xa1, 0xb2, 0xc3, 0xd4])) ||
      /\.pcapng?$/i.test(lower)) {
    hints.push("network")
    return { kind: "pcap", hints }
  }
  // Image
  if (/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(lower)) {
    hints.push("media")
    return { kind: "image", hints }
  }
  // Audio
  if (/\.(wav|mp3|flac|ogg)$/i.test(lower)) {
    hints.push("media")
    return { kind: "audio", hints }
  }
  // Document
  if (/\.(pdf|docx|xlsx|pptx|odt)$/i.test(lower)) {
    hints.push("document")
    return { kind: "document", hints }
  }
  // Source directory heuristic
  const sourceExts = /\.(py|js|ts|java|go|rs|cpp|c|h|php|rb|yaml|yml|json|xml|html|sql)$/i
  if (sourceExts.test(lower)) {
    hints.push("source")
    return { kind: "source", hints }
  }
  return { kind: "unknown", hints }
}

async function scanSourceAt(dir: string, slug: string): Promise<{ entries: AnalysisEntry[]; calls: CallEdge[] }> {
  const entries: AnalysisEntry[] = []
  const calls: CallEdge[] = []
  const allEntries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
  const sourceFiles = allEntries
    .filter((e) => e.isFile() && /\.(py|js|ts|java|go|rs|cpp|c|h|php|rb|yaml|yml|json|xml|html|sql)$/i.test(e.name))
    .map((e) => path.join(e.parentPath ?? dir, e.name))

  const lang = detectLanguage(sourceFiles)

  // Grep for common sink patterns
  const sinkPatterns: Array<{ regex: RegExp; kind: string; danger: string }> = [
    { regex: /os\.system\(|subprocess\.call\(|subprocess\.Popen\(|exec\(|Runtime\.exec\(|child_process\.exec\(/g, kind: "exec", danger: "command_injection" },
    { regex: /eval\(|exec\(|compile\(|__import__\(/g, kind: "eval", danger: "code_injection" },
    { regex: /\.executeQuery\(|\.executeUpdate\(|\.query\(|\.raw\(|\.all\(|cursor\.execute\(/g, kind: "db_query", danger: "sqli" },
    { regex: /render\(|render_template_string\(|\.render\(|template\(|\.Template\(|\.from_string\(/g, kind: "render", danger: "ssti" },
    { regex: /urlopen\(|requests\.get\(|fetch\(|http\.get\(|axios\.get\(|curl\(/g, kind: "http_request", danger: "ssrf" },
    { regex: /pickle\.loads\(|unserialize\(|JSON\.parse\(|JSON\.deserialize\(|ObjectInputStream\(|readObject\(/g, kind: "deserialize", danger: "deser" },
    { regex: /open\(|fopen\(|File\.read|readFile\(|read_text\(/g, kind: "file_read", danger: "path_traversal" },
    { regex: /sprintf\(|format_string\(|print\(|printf\(/g, kind: "format_string", danger: "fmt_string" },
  ]

  // Find entrypoints
  const entryPatterns: Array<{ regex: RegExp; name: string }> = [
    { regex: /def\s+(\w+)\s*\(/g, name: "function" },
    { regex: /function\s+(\w+)\s*\(/g, name: "function" },
    { regex: /app\.(get|post|put|delete|route)\s*\(/g, name: "web_route" },
    { regex: /@(get|post|put|delete|RequestMapping)\s*\(/g, name: "web_route" },
    { regex: /router\.(get|post|put|delete)\s*\(/g, name: "web_route" },
    { regex: /main\s*\(/g, name: "main_entry" },
  ]

  for (const file of sourceFiles.slice(0, 200)) {
    const relPath = path.relative(dir, file)
    try {
      const content = await readFile(file, "utf8")
      const lines = content.split(/\r?\n/)

      // Scan for sinks
      for (const pattern of sinkPatterns) {
        for (let i = 0; i < lines.length; i++) {
          if (pattern.regex.test(lines[i])) {
            pattern.regex.lastIndex = 0
            entries.push({
              kind: "sink",
              name: pattern.danger,
              location: { file: relPath, line: i + 1 },
              detail: `potential ${pattern.danger} sink: ${lines[i].trim().slice(0, 100)}`,
            })
          }
        }
      }

      // Scan for entrypoints
      for (const pattern of entryPatterns) {
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(pattern.regex)
          if (m) {
            entries.push({
              kind: "entrypoint",
              name: pattern.name === "web_route" ? `route:${lines[i].trim().slice(0, 60)}` : `fn:${m[1]}`,
              location: { file: relPath, line: i + 1 },
            })
          }
        }
      }

      // Scan for flags
      const flagMatches = content.match(FLAG_RE)
      if (flagMatches) {
        for (const f of flagMatches) {
          entries.push({ kind: "flag", name: "flag_candidate", location: { file: relPath }, detail: f })
        }
      }

      // Scan for secrets
      if (/api.?key|secret|token|password|credential/i.test(content)) {
        for (let i = 0; i < Math.min(lines.length, 500); i++) {
          if (/(api.?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/i.test(lines[i])) {
            entries.push({
              kind: "secret",
              name: "hardcoded_secret",
              location: { file: relPath, line: i + 1 },
              detail: lines[i].trim().slice(0, 100),
            })
          }
        }
      }
    } catch { /* skip unreadable */ }
  }

  return { entries, calls }
}

async function buildIr(target: string, slug: string, workDir: string): Promise<string> {
  const stat = await lstat(target)
  const sha256 = stat.isFile() ? await sha256File(target) : ""
  const size = stat.size

  let kind: ArtifactKind = "unknown"
  let language: Language = "unknown"
  let hints: string[] = []
  let entries: AnalysisEntry[] = []
  let calls: CallEdge[] = []

  if (stat.isDirectory()) {
    kind = "source"
    language = detectLanguage(await readdir(target))
    const scanned = await scanSourceAt(target, slug)
    entries = scanned.entries
    calls = scanned.calls
  } else {
    const sample = await readSample(target)
    const strings = printableStrings(sample)
    const detection = detectArtifactKind(target, sample, strings)
    kind = detection.kind
    hints = detection.hints

    if (kind === "elf" || kind === "pe") {
      const fileOut = await safeExec("file", [target], undefined, 5000)
      entries.push({ kind: "source", name: "file_info", detail: fileOut.output.trim().slice(0, 300) })
      const stringsOut = strings.slice(0, 100)
      for (const s of stringsOut) {
        if (/flag|secret|key|password|http/.test(s)) {
          entries.push({ kind: "secret", name: "interesting_string", detail: s })
        }
      }
    }
    if (kind === "archive") {
      const unzipOut = await safeExec("unzip", ["-l", target], undefined, 5000).catch(() => ({ output: "", ok: false, exitCode: null }))
      if (unzipOut.ok) entries.push({ kind: "source", name: "archive_contents", detail: unzipOut.output.slice(0, 1000) })
    }
  }

  const db: ArtifactDb = {
    slug,
    target,
    sha256,
    size,
    artifact: { kind, language, hints },
    entries,
    calls,
    createdAt: new Date().toISOString(),
  }

  const dbDir = path.join(workDir, "work", "analysis", slug)
  await mkdir(dbDir, { recursive: true })
  await writeFile(path.join(dbDir, "artifact.db.json"), JSON.stringify(db, null, 2))

  return JSON.stringify(db, null, 2)
}

export default tool({
  description:
    "Unified CTF artifact analysis: build IR, detect file type, scan source/binary for sinks/entrypoints/secrets/flags, and store results under work/analysis/<slug>/.",
  args: {
    action: tool.schema
      .string()
      .optional()
      .describe("build | query. build=analyze file; query=run detection rules against built IR. Default build."),
    target: tool.schema.string().describe("File or directory path to analyze"),
    slug: tool.schema
      .string()
      .optional()
      .describe("Slug for the analysis output directory. Defaults to filename basename."),
    ruleset: tool.schema
      .string()
      .optional()
      .describe("For query mode: which ruleset to apply (e.g. audit-sqli, audit-command-injection)."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = await resolveAllowedPath(args.target, context)
    const workDir = context.worktree ?? context.directory ?? process.cwd()
    const slug = args.slug ?? path.basename(target).replace(/\.(zip|tar|gz|bz2|7z|rar)$/i, "")
    const action = args.action ?? "build"

    if (!existsSync(target)) {
      return `[artifact-analyze] target not found: ${target}`
    }

    if (action === "build") {
      const result = await buildIr(target, slug, workDir)
      if (args.jsonOnly) return result
      const db: ArtifactDb = JSON.parse(result)
      const lines: string[] = [
        `=== Artifact Analysis: ${slug} ===`,
        `Type: ${db.artifact.kind}  Language: ${db.artifact.language}  Size: ${db.size} bytes  SHA256: ${db.sha256.slice(0, 16)}...`,
        `Hints: ${db.artifact.hints.join(", ") || "none"}`,
        `Entries: ${db.entries.length}`,
        "",
        "--- Findings ---",
      ]
      for (const e of db.entries) {
        const loc = e.location ? `  ${e.location.file}${e.location.line ? `:${e.location.line}` : ""}` : ""
        lines.push(`  [${e.kind}] ${e.name}${loc}`)
        if (e.detail) lines.push(`         ${e.detail}`)
      }
      lines.push("", `--- Stored under work/analysis/${slug}/ ---`)
      return lines.join("\n")
    }

    if (action === "query") {
      const dbPath = path.join(workDir, "work", "analysis", slug, "artifact.db.json")
      if (!existsSync(dbPath)) {
        return `[artifact-analyze] No IR found for ${slug}. Run 'build' first.`
      }
      const db: ArtifactDb = JSON.parse(await readFile(dbPath, "utf8"))

      // Filter by ruleset
      const matching = db.entries
        .filter((e) => e.kind === "sink")
        .filter((e) => !args.ruleset || e.name === args.ruleset.replace("audit-", ""))

      if (args.jsonOnly) return JSON.stringify(matching, null, 2)
      if (matching.length === 0) return `[artifact-analyze] No matching findings for ruleset: ${args.ruleset ?? "all"}`
      const lines = [`=== Query Results: ${slug} (${args.ruleset ?? "all entries"}) ===`]
      for (const m of matching) {
        const loc = m.location ? `${m.location.file}:${m.location.line}` : "?"
        lines.push(`  [${m.name}] ${loc}  ${m.detail ?? ""}`)
      }
      return lines.join("\n")
    }

    return `[artifact-analyze] Unknown action: ${action}. Use build or query.`
  },
})
