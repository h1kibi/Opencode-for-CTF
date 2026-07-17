import { tool } from "@opencode-ai/plugin"
import { lstat, open, readdir, readFile } from "node:fs/promises"
import path from "node:path"

const SAMPLE_BYTES = 192 * 1024
const FULL_TEXT_BYTES = 768 * 1024
const DEFAULT_FLAG_RE =
  /(?:[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}|[A-Za-z0-9_@.-]{2,32}\[[^\r\n\]]{1,200}\]|flag[-_:][A-Za-z0-9_@.,:;+\-=/]{8,200})/gi
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
  "coverage",
])
const TEXT_EXT =
  /\.(txt|md|py|js|mjs|cjs|ts|tsx|jsx|json|yaml|yml|toml|ini|env|html|css|php|java|kt|go|rs|c|cc|cpp|h|hpp|sage|sh|sql|xml|log|conf|cfg|properties|gradle|Dockerfile)$/i
const ARCHIVE_EXT = /\.(zip|jar|war|apk|docx|xlsx|pptx|7z|rar|tar|tar\.gz|tgz|gz|bz2|xz)$/i
const PCAP_EXT = /\.(pcap|pcapng)$/i
const MEDIA_EXT = /\.(png|jpg|jpeg|gif|bmp|wav|mp3|mp4|pdf|raw|mem|img|iso)$/i
const BINARY_EXT = /\.(elf|exe|dll|so|bin|out)$/i

function makeFlagRegex(pattern?: string) {
  if (!pattern) return DEFAULT_FLAG_RE
  try {
    return new RegExp(pattern, "g")
  } catch (error) {
    throw new Error(`invalid flagPattern regex: ${error instanceof Error ? error.message : String(error)}`)
  }
}

type Signal = {
  kind: string
  rel: string
  target: string
  detail: string
  weight: number
}

type FileInfo = {
  file: string
  rel: string
  size: number
  priority: number
  strings: string[]
}

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

function relDepth(rel: string) {
  return rel.split(/[\\/]+/).filter(Boolean).length
}

function priorityScore(rel: string) {
  const base = path.basename(rel)
  const lower = rel.toLowerCase()
  let score = 0
  if (
    /^(readme|dockerfile|docker-compose\.ya?ml|compose\.ya?ml|package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|cargo\.toml|composer\.json)$/i.test(
      base,
    )
  )
    score += 24
  if (/^(app|main|server|index|manage|settings|config)\./i.test(base)) score += 20
  if (/routes?|controllers?|templates?|views?|api|auth|admin|upload|flag|debug|bot|secret/i.test(rel)) score += 16
  if (/flag|secret|challenge|chall|vuln|pwn|rev|crypto/i.test(lower)) score += 10
  if (TEXT_EXT.test(base)) score += 5
  if (ARCHIVE_EXT.test(base) || MEDIA_EXT.test(base) || PCAP_EXT.test(base) || BINARY_EXT.test(base)) score += 9
  if (/\.map$/i.test(base) || /sourcemap/i.test(lower)) score += 8
  score -= Math.max(0, relDepth(rel) - 2) * 2
  return score
}

function printableRatio(buf: Buffer) {
  if (!buf.length) return 1
  let printable = 0
  for (const b of buf) {
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) printable++
  }
  return printable / buf.length
}

function looksTextual(file: string, sample: Buffer) {
  if (TEXT_EXT.test(file) || /(^|[\\/])Dockerfile$/i.test(file)) return true
  if (sample.includes(0x00)) return false
  return printableRatio(sample) > 0.82
}

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  return Array.from(text.matchAll(/[ -~]{5,}/g), (m) => m[0]).slice(0, 60)
}

function safeDirectFlagCandidates(text: string, sample: Buffer, flagRegex: RegExp) {
  const ratio = printableRatio(sample)
  const binaryLike =
    sample.includes(0x00) ||
    sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    sample.subarray(0, 2).toString() === "MZ"
  const matches = Array.from(new Set(text.match(flagRegex) ?? [])).slice(0, 8)
  if (binaryLike && ratio < 0.9) return { direct: [] as string[], suspicious: matches }
  return { direct: matches, suspicious: [] as string[] }
}

async function readHeadTail(target: string, size: number, maxBytes = SAMPLE_BYTES) {
  const fd = await open(target, "r")
  try {
    if (size <= maxBytes) {
      const buf = Buffer.alloc(size)
      const { bytesRead } = await fd.read(buf, 0, size, 0)
      return buf.subarray(0, bytesRead)
    }
    const headBytes = Math.floor(maxBytes * 0.75)
    const tailBytes = maxBytes - headBytes
    const head = Buffer.alloc(headBytes)
    const tail = Buffer.alloc(tailBytes)
    const headRead = await fd.read(head, 0, headBytes, 0)
    const tailRead = await fd.read(tail, 0, tailBytes, Math.max(0, size - tailBytes))
    return Buffer.concat([
      head.subarray(0, headRead.bytesRead),
      Buffer.from("\n--TAIL-SAMPLE--\n"),
      tail.subarray(0, tailRead.bytesRead),
    ])
  } finally {
    await fd.close()
  }
}

async function safeReadText(file: string, size: number, sample: Buffer) {
  if (size <= FULL_TEXT_BYTES && looksTextual(file, sample)) {
    try {
      return await readFile(file, "utf8")
    } catch {
      return sample.toString("utf8")
    }
  }
  return looksTextual(file, sample) ? sample.toString("utf8") : sample.toString("latin1")
}

async function collectCandidates(root: string, maxCandidates: number, base = root, out: string[] = []) {
  if (out.length >= maxCandidates) return out
  const stat = await lstat(root)
  if (stat.isFile()) {
    out.push(root)
    return out
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return out

  const entries = await readdir(root, { withFileTypes: true })
  entries.sort((a, b) => {
    const ar = path.relative(base, path.join(root, a.name)) || a.name
    const br = path.relative(base, path.join(root, b.name)) || b.name
    const as = priorityScore(ar) + (a.isDirectory() ? 3 : 0)
    const bs = priorityScore(br) + (b.isDirectory() ? 3 : 0)
    return bs - as || a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    if (out.length >= maxCandidates) break
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    if (entry.isSymbolicLink()) continue
    await collectCandidates(path.join(root, entry.name), maxCandidates, base, out)
  }
  return out
}

async function collectFiles(root: string, maxFiles: number) {
  const stat = await lstat(root)
  if (stat.isFile()) return [root]
  const candidates = await collectCandidates(root, Math.max(maxFiles * 6, 500))
  return candidates
    .map((file) => ({ file, rel: path.relative(root, file) || path.basename(file) }))
    .sort(
      (a, b) =>
        priorityScore(b.rel) - priorityScore(a.rel) || relDepth(a.rel) - relDepth(b.rel) || a.rel.localeCompare(b.rel),
    )
    .slice(0, maxFiles)
    .map((x) => x.file)
}

function signalFromFile(
  file: string,
  rel: string,
  sample: Buffer,
  text: string,
  strings: string[],
  flagRegex: RegExp,
): Signal[] {
  const lower = `${rel}\n${text.slice(0, 30000)}\n${strings.join("\n")}`.toLowerCase()
  const magic =
    sample
      .subarray(0, 16)
      .toString("hex")
      .match(/.{1,2}/g)
      ?.join(" ") ?? ""
  const out: Signal[] = []
  const add = (kind: string, detail: string, weight: number) => out.push({ kind, rel, target: file, detail, weight })

  flagRegex.lastIndex = 0
  const flagCandidates = safeDirectFlagCandidates(text, sample, flagRegex)
  for (const flag of flagCandidates.direct) add("direct_flag", flag, 100)
  for (const flag of flagCandidates.suspicious)
    add("binary_flag_like_text", `binary-like sample contains flag-like text: ${flag}`, 42)

  if (/\.(zip|jar|war|apk|docx|xlsx|pptx)$/i.test(rel) || magic.startsWith("50 4b"))
    add("archive", "zip-like archive; use ctf-safe-extract", 90)
  else if (/\.7z$/i.test(rel) || magic.startsWith("37 7a bc af 27 1c"))
    add("archive", "7z archive; use ctf-safe-extract", 88)
  else if (/(\.tar|\.tar\.gz|\.tgz|\.gz|\.bz2|\.xz)$/i.test(rel))
    add("archive", "tar/compressed archive; use ctf-safe-extract", 84)
  if (
    /(?:^|[\\/])(chall|challenge|pwn|vuln|rop|fmt|heap|baby|main|bin|elf)[^\\/]*\.(zip|jar|7z|rar|tar|tgz|gz)$/i.test(
      rel,
    )
  )
    add("pwn_archive_name", "archive name looks like a packaged native challenge", 74)

  if (
    /\b(n|e|c|p|q|dp|dq|phi)\d*\b\s*[:=]\s*(0x[0-9a-fA-F]+|\d+)/.test(text) ||
    /BEGIN (RSA )?(PUBLIC|PRIVATE) KEY/.test(text)
  )
    add("rsa", "RSA-like parameters/key material", 82)
  if (/sourceMappingURL=|\.map$/i.test(`${rel}\n${text.slice(0, 12000)}`)) add("source_map", "source map indicator", 80)
  if (
    /pom\.xml|build\.gradle|spring|servlet|jsessionid|tomcat|jsp|@getmapping|@postmapping|@requestmapping/i.test(
      `${rel}\n${text.slice(0, 25000)}`,
    )
  )
    add("java_web", "Java/Spring/Servlet web source indicator", 78)
  if (/openapi|swagger|"paths"\s*:|\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//.test(text))
    add("api_map", "OpenAPI/Swagger/plain API list indicator", 76)
  if (
    /app\.py|server\.(js|ts)|index\.php|routes?|controllers?|templates?|dockerfile|package\.json|requirements\.txt|flask|express|django|fastapi|laravel|graphql|jwt|cookie|session|csrf|upload|admin/i.test(
      lower,
    )
  )
    add("web_source", "Web source/config indicator", 70)
  if (
    /upload|filemanager|ueditor|writefile|move_uploaded_file|createwritestream|files\.write|send_file|download|\.\.\//i.test(
      lower,
    )
  )
    add("file_write", "Upload/file-write/path primitive candidate", 68)
  if (
    /remote\s*\(\s*["'][^"']+["']\s*,\s*\d{2,5}\s*\)/i.test(text) ||
    /\bnc\s+[^\s]+\s+\d{2,5}\b/i.test(text) ||
    /\b(?:host|server|remote)\s*[:=]\s*[^\s:]+\b/i.test(text) ||
    /\b[A-Za-z0-9.-]+:\d{2,5}\b/.test(text)
  )
    add("remote_endpoint", "remote host/port clue adjacent to the challenge bundle", 73)
  if (PCAP_EXT.test(rel)) add("pcap", "packet capture", 86)
  if (MEDIA_EXT.test(rel)) add("stego_media", "media/document/forensics candidate", 74)
  if (
    BINARY_EXT.test(rel) ||
    sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    sample.subarray(0, 2).toString() === "MZ"
  )
    add("binary", "binary candidate", 72)
  if (/cipher|encrypt|decrypt|nonce|xor|aes|base64|rot13|vigenere|substitution|modulus/i.test(lower))
    add("crypto", "crypto/encoding indicator", 58)
  return out
}

function decide(signals: Signal[]) {
  const byKind = new Map<string, Signal[]>()
  for (const s of signals) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, [])
    byKind.get(s.kind)!.push(s)
  }
  for (const list of byKind.values()) list.sort((a, b) => b.weight - a.weight)

  const pick = (kind: string) => byKind.get(kind)?.[0]
  const directFlag = pick("direct_flag")
  if (directFlag)
    return {
      verdict: "direct_flag",
      confidence: "high",
      nextTool: "none",
      nextTarget: directFlag.rel,
      spawnSubagent: "no",
      directSolve: "yes",
      reason: `verify flag candidate: ${directFlag.detail}`,
    }
  const archive = pick("archive")
  const remoteEndpoint = pick("remote_endpoint")
  const pwnArchiveName = pick("pwn_archive_name")
  const binary = pick("binary")
  if (archive && remoteEndpoint && (binary || pwnArchiveName)) {
    return {
      verdict: "pwn_bundle",
      confidence: "high",
      nextTool: "ctf-safe-extract",
      nextTarget: archive.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: `packaged PWN bundle: ${archive.detail}; ${remoteEndpoint.detail}`,
    }
  }
  if (archive)
    return {
      verdict: "archive",
      confidence: "high",
      nextTool: "ctf-safe-extract",
      nextTarget: archive.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: archive.detail,
    }
  const pcap = pick("pcap")
  if (pcap)
    return {
      verdict: "pcap",
      confidence: "high",
      nextTool: "ctf-pcap-probe",
      nextTarget: pcap.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: pcap.detail,
    }
  const rsa = pick("rsa")
  if (rsa)
    return {
      verdict: "rsa",
      confidence: "high",
      nextTool: "ctf-rsa-probe",
      nextTarget: rsa.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: rsa.detail,
    }
  const sourceMap = pick("source_map")
  if (sourceMap)
    return {
      verdict: "web_source_map",
      confidence: "high",
      nextTool: "ctf-web-source-map",
      nextTarget: sourceMap.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: sourceMap.detail,
    }
  const javaWeb = pick("java_web")
  if (javaWeb)
    return {
      verdict: "java_web",
      confidence: "high",
      nextTool: "ctf-java-map",
      nextTarget: ".",
      spawnSubagent: "no",
      directSolve: "no",
      reason: javaWeb.detail,
    }
  const api = pick("api_map")
  if (api)
    return {
      verdict: "api_map",
      confidence: "medium",
      nextTool: "ctf-api-map",
      nextTarget: api.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: api.detail,
    }
  const web = pick("web_source")
  if (web)
    return {
      verdict: "web_source",
      confidence: "medium",
      nextTool: "ctf-web-source-map",
      nextTarget: ".",
      spawnSubagent: "no",
      directSolve: "no",
      reason: web.detail,
    }
  if (binary)
    return {
      verdict: "binary",
      confidence: "medium",
      nextTool: "ctf-binary-probe",
      nextTarget: binary.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: binary.detail,
    }
  const stego = pick("stego_media")
  if (stego)
    return {
      verdict: "stego_media",
      confidence: "medium",
      nextTool: "ctf-stego-probe",
      nextTarget: stego.rel,
      spawnSubagent: "no",
      directSolve: "no",
      reason: stego.detail,
    }
  const crypto = pick("crypto")
  if (crypto)
    return {
      verdict: "crypto_or_encoding",
      confidence: "low",
      nextTool: "none",
      nextTarget: crypto.rel,
      spawnSubagent: "maybe",
      directSolve: "maybe",
      reason: crypto.detail,
    }
  return {
    verdict: "unknown",
    confidence: "low",
    nextTool: "none",
    nextTarget: ".",
    spawnSubagent: "maybe",
    directSolve: "no",
    reason: "no high-confidence fast-lane signal",
  }
}

export default tool({
  description:
    "CTF one-shot triage: fastest primary-agent router. Scans high-value files once, emits verdict/confidence/next_tool/next_target/spawn_subagent/direct_solve so the agent can immediately run the best probe without extra reasoning loops.",
  args: {
    target: tool.schema.string().default(".").describe("File or directory path to triage"),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 140."),
    flagPattern: tool.schema
      .string()
      .optional()
      .describe("Optional JavaScript regex source for known flag format. Example: DASCTF\\{[^}]+\\}"),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const flagRegex = makeFlagRegex(args.flagPattern)
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 140, 600))
    const rootStat = await lstat(target)
    const files = rootStat.isDirectory() ? await collectFiles(target, maxFiles) : [target]
    const signals: Signal[] = []
    const infos: FileInfo[] = []

    for (const file of files) {
      const stat = await lstat(file)
      if (!stat.isFile()) continue
      const rel = path.relative(target, file) || path.basename(file)
      const sample = await readHeadTail(file, stat.size)
      const strings = printableStrings(sample)
      const text = await safeReadText(file, stat.size, sample)
      infos.push({ file, rel, size: stat.size, priority: priorityScore(rel), strings: strings.slice(0, 5) })
      signals.push(...signalFromFile(file, rel, sample, text, strings, flagRegex))
    }

    signals.sort((a, b) => b.weight - a.weight || a.rel.localeCompare(b.rel))
    const decision = decide(signals)
    const topFiles = infos
      .sort((a, b) => b.priority - a.priority || a.rel.localeCompare(b.rel))
      .slice(0, 24)
      .map((i) => `${i.rel}\t${i.size} bytes\tpri=${i.priority}\t${i.strings.slice(0, 2).join(" | ")}`)
    const topSignals = signals.slice(0, 30).map((s) => `${s.kind}\t${s.rel}\t${s.detail}`)

    const recommended = []
    if (decision.nextTool !== "none") recommended.push(`run ${decision.nextTool} on ${decision.nextTarget}`)
    if (decision.verdict === "direct_flag")
      recommended.push("read only the source line/file for verification, then write the exact flag to agent_flag.txt")
    if (decision.verdict === "unknown")
      recommended.push(
        "fall back to ctf-quick-triage or inspect only top_files; spawn one subagent only after a category is evidenced",
      )
    if (decision.verdict === "web_source")
      recommended.push("use source map output to inspect only top routes/config/sinks before any fuzzing")
    if (decision.verdict === "archive")
      recommended.push("after extraction, rerun ctf-one-shot-triage on the extracted directory")
    if (decision.verdict === "pwn_bundle")
      recommended.push(
        "after extraction, stay in the PWN fast lane: run ctf-pwn-fast-bootstrap or ctf-binary-probe on the extracted ELF before archive/forensics branching",
      )

    return [
      `target: ${target}`,
      `files_inspected: ${infos.length}/${files.length}`,
      `flag_pattern: ${args.flagPattern ? "custom" : "default"}`,
      `verdict: ${decision.verdict}`,
      `confidence: ${decision.confidence}`,
      `next_tool: ${decision.nextTool}`,
      `next_target: ${decision.nextTarget}`,
      `spawn_subagent: ${decision.spawnSubagent}`,
      `direct_solve: ${decision.directSolve}`,
      `reason: ${decision.reason}`,
      "top_signals:",
      ...(topSignals.length ? topSignals.map((x) => `- ${x}`) : ["- none"]),
      "top_files:",
      ...(topFiles.length ? topFiles.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...recommended.map((x) => `- ${x}`),
    ].join("\n")
  },
})
