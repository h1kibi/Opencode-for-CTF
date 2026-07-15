import { tool } from "@opencode-ai/plugin"
import { execFile as execFileCb } from "node:child_process"
import { access, lstat, mkdir, readdir, rm, stat, open, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import path from "node:path"
import { constants as fsConstants } from "node:fs"
import { inflateRawSync } from "node:zlib"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}


const execFile = promisify(execFileCb)
const DEFAULT_FLAG_RE = /(?:[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}|[A-Za-z0-9_@.-]{2,32}\[[^\r\n\]]{1,200}\]|flag[-_:][A-Za-z0-9_@.,:;+\-=/]{8,200})/gi
const MAX_OUTPUT = 256 * 1024
const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", "venv", ".venv"])

function makeFlagRegex(pattern?: string) {
  if (!pattern) return DEFAULT_FLAG_RE
  try {
    return new RegExp(pattern, "g")
  } catch (error) {
    throw new Error(`invalid flagPattern regex: ${error instanceof Error ? error.message : String(error)}`)
  }
}

type ArchiveKind = "zip" | "tar" | "7z" | "unknown"

type ExtractedFile = {
  rel: string
  size: number
  flags: string[]
  suspicious: string[]
  binaryLike: boolean
}

type ZipLocalEntry = {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  dataStart: number
  flags: number
}

async function exists(cmd: string) {
  try {
    await execFile(process.platform === "win32" ? "where" : "which", [cmd], { timeout: 5000, maxBuffer: 64 * 1024 })
    return true
  } catch {
    return false
  }
}

async function find7z() {
  if (await exists("7z")) return "7z"
  const candidates = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
    "C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WinGet\\Links\\7z.exe",
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // continue
    }
  }
  return ""
}

function archiveKind(target: string): ArchiveKind {
  const lower = target.toLowerCase()
  if (/\.(zip|jar|war|apk|docx|xlsx|pptx)$/.test(lower)) return "zip"
  if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$/.test(lower)) return "tar"
  if (/\.(7z|rar)$/.test(lower)) return "7z"
  return "unknown"
}

function cleanName(name: string) {
  return name.replace(/\.(tar\.gz|tar\.bz2|tar\.xz|zip|jar|war|apk|docx|xlsx|pptx|tgz|tbz2|txz|7z|rar)$/i, "").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "archive"
}

function isDangerousMember(name: string) {
  const normalized = name.replace(/\\/g, "/")
  if (!normalized || normalized.includes("\0")) return true
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return true
  return normalized.split("/").some((part) => part === "..")
}

function isInsideResolvedBase(targetPath: string, basePath: string) {
  const rel = path.relative(basePath, targetPath)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

function parse7zList(stdout: string) {
  const names: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S{5}\s+\d+\s+\d*\s+(.+)$/)
    if (m?.[1]) names.push(m[1].trim())
  }
  return names
}

async function listZipNative(target: string) {
  const fd = await open(target, "r")
  try {
    const st = await fd.stat()
    const tailSize = Math.min(st.size, 1024 * 1024)
    const tail = Buffer.alloc(tailSize)
    await fd.read(tail, 0, tailSize, st.size - tailSize)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error("zip EOCD not found")
    const entries = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (cdSize > 64 * 1024 * 1024) throw new Error("zip central directory too large")
    const cd = Buffer.alloc(cdSize)
    await fd.read(cd, 0, cdSize, cdOffset)
    const names: string[] = []
    let off = 0
    for (let i = 0; i < entries && off + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(off) !== 0x02014b50) break
      const nameLen = cd.readUInt16LE(off + 28)
      const extraLen = cd.readUInt16LE(off + 30)
      const commentLen = cd.readUInt16LE(off + 32)
      const name = cd.subarray(off + 46, off + 46 + nameLen).toString("utf8")
      if (name) names.push(name)
      off += 46 + nameLen + extraLen + commentLen
    }
    return names
  } finally {
    await fd.close()
  }
}

function inferZipDataEnd(buf: Buffer, entry: ZipLocalEntry) {
  if (entry.compressedSize > 0 && entry.dataStart + entry.compressedSize <= buf.length) return entry.dataStart + entry.compressedSize
  const signatures = [0x04034b50, 0x02014b50, 0x06054b50, 0x08074b50]
  for (let off = entry.dataStart; off + 4 <= buf.length; off += 1) {
    const sig = buf.readUInt32LE(off)
    if (signatures.includes(sig)) return off
  }
  return buf.length
}

async function scanZipLocalHeaders(target: string, maxEntries: number) {
  const buf = await import("node:fs/promises").then((fs) => fs.readFile(target))
  const entries: ZipLocalEntry[] = []
  let off = 0
  while (off + 30 <= buf.length && entries.length < maxEntries) {
    const sig = buf.readUInt32LE(off)
    if (sig !== 0x04034b50) {
      off += 1
      continue
    }
    const flags = buf.readUInt16LE(off + 6)
    const method = buf.readUInt16LE(off + 8)
    const compressedSize = buf.readUInt32LE(off + 18)
    const uncompressedSize = buf.readUInt32LE(off + 22)
    const nameLen = buf.readUInt16LE(off + 26)
    const extraLen = buf.readUInt16LE(off + 28)
    const nameStart = off + 30
    const nameEnd = nameStart + nameLen
    const dataStart = nameEnd + extraLen
    if (dataStart > buf.length) break
    const rawName = buf.subarray(nameStart, nameEnd)
    const utf8 = (flags & 0x800) !== 0
    const name = rawName.toString(utf8 ? "utf8" : "latin1")
    const entry = { name, method, compressedSize, uncompressedSize, dataStart, flags }
    entries.push(entry)
    const next = inferZipDataEnd(buf, entry)
    off = next > off ? next : off + 1
  }
  return { buf, entries }
}

async function listZipByLocalHeaders(target: string, maxEntries: number) {
  const { entries } = await scanZipLocalHeaders(target, maxEntries)
  return entries.map((x) => x.name).filter(Boolean)
}

async function extractZipByLocalHeaders(target: string, outDir: string, maxEntries: number) {
  const { buf, entries } = await scanZipLocalHeaders(target, maxEntries)
  const recovered: string[] = []
  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, "/")
    if (!normalized || isDangerousMember(normalized)) continue
    const dest = path.resolve(outDir, normalized)
    const base = path.resolve(outDir)
    if (!isInsideResolvedBase(dest, base)) continue
    if (normalized.endsWith("/")) {
      await mkdir(dest, { recursive: true })
      recovered.push(normalized)
      continue
    }
    await mkdir(path.dirname(dest), { recursive: true })
    const dataEnd = inferZipDataEnd(buf, entry)
    if (dataEnd <= entry.dataStart || dataEnd > buf.length) continue
    const compressed = buf.subarray(entry.dataStart, dataEnd)
    let payload: Buffer
    if (entry.method === 0) payload = compressed
    else if (entry.method === 8) payload = inflateRawSync(compressed)
    else continue
    await writeFile(dest, payload)
    recovered.push(normalized)
  }
  return recovered
}

async function powershellZip(target: string, outDir: string) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$zip=[System.IO.Compression.ZipFile]::OpenRead($args[0])",
    "try { foreach($e in $zip.Entries) {",
    "  $dest=[System.IO.Path]::GetFullPath([System.IO.Path]::Combine($args[1], $e.FullName))",
    "  $base=[System.IO.Path]::GetFullPath($args[1])",
    "  if(-not $dest.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'zip slip blocked: '+$e.FullName }",
    "  if($e.FullName.EndsWith('/') -or $e.FullName.EndsWith('\\')) { [System.IO.Directory]::CreateDirectory($dest) | Out-Null; continue }",
    "  $parent=[System.IO.Path]::GetDirectoryName($dest)",
    "  if($parent) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }",
    "  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)",
    "} } finally { $zip.Dispose() }",
  ].join("; ")
  await execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, target, outDir], { timeout: 120000, maxBuffer: MAX_OUTPUT })
  return "powershell-zip"
}

async function listArchive(target: string, kind: ArchiveKind) {
  if (kind === "zip") {
    try {
      return await listZipNative(target)
    } catch {
      // fall through to tolerant recovery first
    }
    try {
      const localHeaderNames = await listZipByLocalHeaders(target, 5000)
      if (localHeaderNames.length) return localHeaderNames
    } catch {
      // continue to external backends
    }
    if (await exists("unzip")) {
      try {
        const { stdout } = await execFile("unzip", ["-Z", "-1", target], { timeout: 30000, maxBuffer: MAX_OUTPUT })
        return stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      } catch {
        // continue
      }
    }
    if (await find7z()) {
      const sevenZip = await find7z()
      try {
        const { stdout } = await execFile(sevenZip, ["l", "-ba", target], { timeout: 30000, maxBuffer: MAX_OUTPUT })
        return parse7zList(stdout)
      } catch {
        // continue
      }
    }
    if (await exists("jar")) {
      try {
        const { stdout } = await execFile("jar", ["tf", target], { timeout: 30000, maxBuffer: MAX_OUTPUT })
        return stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      } catch {
        // continue
      }
    }
  }
  if (kind === "tar") {
    if (await exists("tar")) {
      const { stdout } = await execFile("tar", ["-tf", target], { timeout: 30000, maxBuffer: MAX_OUTPUT })
      return stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    }
  }
  if (kind === "7z" || kind === "unknown") {
    const sevenZip = await find7z()
    if (sevenZip) {
      const { stdout } = await execFile(sevenZip, ["l", "-ba", target], { timeout: 30000, maxBuffer: MAX_OUTPUT })
      return parse7zList(stdout)
    }
  }
  throw new Error(`no supported listing backend for archive kind ${kind}`)
}

async function extractArchive(target: string, kind: ArchiveKind, outDir: string) {
  if (kind === "zip") {
    try {
      return await powershellZip(target, outDir)
    } catch {
      // fall through to tolerant recovery first
    }
    try {
      const recovered = await extractZipByLocalHeaders(target, outDir, 5000)
      if (recovered.length) return "zip-local-header-recovery"
    } catch {
      // continue to external backends
    }
    if (await exists("unzip")) {
      try {
        await execFile("unzip", ["-q", target, "-d", outDir], { timeout: 120000, maxBuffer: MAX_OUTPUT })
        return "unzip"
      } catch {
        // continue
      }
    }
    if (await find7z()) {
      const sevenZip = await find7z()
      try {
        await execFile(sevenZip, ["x", target, `-o${outDir}`, "-y"], { timeout: 120000, maxBuffer: MAX_OUTPUT })
        return "7z"
      } catch {
        // continue
      }
    }
    if (await exists("jar")) {
      await execFile("jar", ["xf", target], { cwd: outDir, timeout: 120000, maxBuffer: MAX_OUTPUT })
      return "jar"
    }
  }
  if (kind === "tar") {
    if (await exists("tar")) {
      await execFile("tar", ["-xf", target, "-C", outDir], { timeout: 120000, maxBuffer: MAX_OUTPUT })
      return "tar"
    }
  }
  const sevenZip = await find7z()
  if (sevenZip) {
    await execFile(sevenZip, ["x", target, `-o${outDir}`, "-y"], { timeout: 120000, maxBuffer: MAX_OUTPUT })
    return "7z"
  }
  throw new Error(`no supported extraction backend for archive kind ${kind}`)
}

async function collectFiles(root: string, maxFiles: number, out: string[] = []) {
  if (out.length >= maxFiles) return out
  const st = await lstat(root)
  if (st.isFile()) {
    out.push(root)
    return out
  }
  if (!st.isDirectory()) return out
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (out.length >= maxFiles) break
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    await collectFiles(path.join(root, entry.name), maxFiles, out)
  }
  return out
}

function suspiciousHints(rel: string, sample: Buffer) {
  const lower = rel.toLowerCase()
  const text = sample.toString("latin1").toLowerCase()
  const hints: string[] = []
  if (/flag|secret|token|key|admin|debug|backup|\.env|config/.test(lower) || /flag|secret|token|admin|debug/.test(text)) hints.push("secret/config/flag naming")
  if (/package\.json|requirements\.txt|pom\.xml|dockerfile|compose|routes?|controllers?|templates?|\.php|\.jsp|\.html|\.js|\.ts/.test(lower)) hints.push("web/source candidate")
  if (/\.pcapng?$|\.png$|\.jpe?g$|\.wav$|\.pdf$|\.docx$|\.xlsx$|\.pptx$|\.mem$|\.raw$|\.img$/.test(lower)) hints.push("forensics/media candidate")
  if (/rsa|cipher|crypto|encrypt|decrypt|public|private/.test(lower) || /\bn\s*[:=]|\be\s*[:=]|\bc\s*[:=]/.test(text)) hints.push("crypto/RSA candidate")
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || sample.subarray(0, 2).toString() === "MZ") hints.push("binary candidate")
  return hints
}

function binaryLikeSample(sample: Buffer) {
  if (sample.length === 0) return false
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || sample.subarray(0, 2).toString() === "MZ") return true
  let printable = 0
  for (const byte of sample) {
    if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32)) return true
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) printable++
  }
  return printable / sample.length < 0.75
}

async function inspectExtracted(outDir: string, maxFiles: number, maxBytes: number, flagRegex: RegExp) {
  const files = await collectFiles(outDir, maxFiles)
  const results: ExtractedFile[] = []
  let totalBytes = 0
  for (const file of files) {
    const st = await stat(file)
    if (!st.isFile()) continue
    totalBytes += st.size
    if (totalBytes > maxBytes) break
    const fd = await import("node:fs/promises").then((fs) => fs.open(file, "r"))
    try {
      const buf = Buffer.alloc(Math.min(st.size, 128 * 1024))
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      const sample = buf.subarray(0, bytesRead)
      const text = sample.toString("latin1")
      flagRegex.lastIndex = 0
      const binaryLike = binaryLikeSample(sample)
      const flags = Array.from(new Set<string>(text.match(flagRegex) ?? [])).slice(0, 20)
      const rel = path.relative(outDir, file)
      results.push({ rel, size: st.size, flags, suspicious: suspiciousHints(rel, sample), binaryLike })
    } finally {
      await fd.close()
    }
  }
  return { files, results, totalBytes, truncatedByBytes: totalBytes > maxBytes }
}

export default tool({
  description: "CTF safe archive extraction: list members, reject path traversal/absolute paths, extract into extracted/<archive-name>/, then report tree, flag hits, suspicious files, and next actions.",
  args: {
    target: tool.schema.string().describe("Archive path to list and safely extract"),
    out: tool.schema.string().default("extracted").describe("Relative output root. Default: extracted"),
    maxFiles: tool.schema.number().optional().describe("Maximum archive members/files to inspect. Default 500."),
    maxBytes: tool.schema.number().optional().describe("Maximum extracted bytes to inspect. Default 209715200."),
    overwrite: tool.schema.boolean().optional().describe("Remove existing output directory before extraction. Default false."),
    flagPattern: tool.schema.string().optional().describe("Optional JavaScript regex source for known flag format. Example: DASCTF\\{[^}]+\\}"),
  },
  async execute(args, context) {
    const targetArg = typeof args.target === "string" && args.target.trim() ? args.target : ""
    if (!targetArg) throw new Error("target is required")
    const outArg = typeof args.out === "string" && args.out.trim() ? args.out : "extracted"

    const target = resolveInsideWorkspace(context.directory, targetArg)
    await access(target)
    const flagRegex = makeFlagRegex(args.flagPattern)
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 500, 5000))
    const maxBytes = Math.max(1024 * 1024, Math.min(args.maxBytes ?? 200 * 1024 * 1024, 1024 * 1024 * 1024))
    const kind = archiveKind(target)
    const baseOut = resolveInsideWorkspace(context.directory, outArg)
    const outDir = path.join(baseOut, cleanName(path.basename(target)))
    const relOut = path.relative(context.directory, outDir)
    if (relOut.startsWith("..") || path.isAbsolute(relOut)) throw new Error("output directory must stay inside the current workspace")

    const members = await listArchive(target, kind)
    const dangerous = members.filter(isDangerousMember)
    if (dangerous.length) {
      return [
        `target: ${target}`,
        `archive_kind: ${kind}`,
        `members: ${members.length}`,
        "status: blocked",
        "reason: dangerous archive member paths detected",
        ...dangerous.slice(0, 30).map((x) => `- ${x}`),
      ].join("\n")
    }
    if (members.length > maxFiles) {
      return [
        `target: ${target}`,
        `archive_kind: ${kind}`,
        `members: ${members.length}`,
        "status: blocked",
        `reason: member count exceeds maxFiles=${maxFiles}`,
        "recommended_next: raise maxFiles only if the challenge requires it, otherwise inspect listing first",
      ].join("\n")
    }

    if (args.overwrite) await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })
    const backend = await extractArchive(target, kind, outDir)
    const inspected = await inspectExtracted(outDir, maxFiles, maxBytes, flagRegex)
    const trustedFlagHits = inspected.results.filter((r) => !r.binaryLike).flatMap((r) => r.flags.map((flag) => `${r.rel}: ${flag}`))
    const binaryFlagHints = inspected.results.filter((r) => r.binaryLike && r.flags.length).flatMap((r) => r.flags.map((flag) => `${r.rel}: ${flag}`))
    const suspicious = inspected.results.filter((r) => r.flags.length || r.suspicious.length).slice(0, 80)
    const tree = inspected.results.slice(0, 120).map((r) => `${r.rel}\t${r.size} bytes${r.suspicious.length ? `\t${r.suspicious.join(",")}` : ""}`)
    const next: string[] = []
    if (trustedFlagHits.length) next.push("verify trusted text-like flag hits and write the correct final flag to agent_flag.txt")
    if (binaryFlagHints.length) next.push("binary files contain flag-like bytes; treat them as hints only and verify after source/binary analysis")
    if (suspicious.some((r) => r.suspicious.includes("crypto/RSA candidate"))) next.push("run ctf-rsa-probe on crypto/RSA candidates")
    if (suspicious.some((r) => r.suspicious.includes("web/source candidate"))) next.push("rerun ctf-one-shot-triage on the extracted source directory, then inspect only the top routes/config/templates")
    if (suspicious.some((r) => r.suspicious.includes("forensics/media candidate"))) next.push("run ctf-stego-probe or ctf-pcap-probe on highlighted media/capture files before manual carving")
    if (!next.length) next.push("rerun ctf-one-shot-triage on the output directory and follow next_tool/next_target")

    return [
      `target: ${target}`,
      `archive_kind: ${kind}`,
      `backend: ${backend}`,
      `output: ${outDir}`,
      `verdict: ${trustedFlagHits.length ? "direct_flag" : "archive_extracted"}`,
      `confidence: ${trustedFlagHits.length || suspicious.length ? "high" : "medium"}`,
      `next_tool: ${trustedFlagHits.length ? "none" : "ctf-one-shot-triage"}`,
      `next_target: ${relOut}`,
      `spawn_subagent: no`,
      `direct_solve: ${trustedFlagHits.length ? "yes" : "no"}`,
      `members_listed: ${members.length}`,
      `files_inspected: ${inspected.results.length}`,
      `flag_pattern: ${args.flagPattern ? "custom" : "default"}`,
      `total_bytes_seen: ${inspected.totalBytes}`,
      `truncated_by_bytes: ${inspected.truncatedByBytes}`,
      "flag_hits:",
      ...(trustedFlagHits.length ? trustedFlagHits.slice(0, 50).map((x) => `- ${x}`) : ["- none"]),
      "binary_flag_hints:",
      ...(binaryFlagHints.length ? binaryFlagHints.slice(0, 50).map((x) => `- ${x}`) : ["- none"]),
      "suspicious_files:",
      ...(suspicious.length ? suspicious.map((r) => `- ${r.rel}: ${r.suspicious.join(",") || "flag hit"}`) : ["- none"]),
      "tree:",
      ...tree.map((x) => `- ${x}`),
      "recommended_next:",
      ...next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
