import { tool } from "@opencode-ai/plugin"
import { access, lstat, mkdir, readdir, rm, stat, open } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

const MAX_OUTPUT = 256 * 1024
const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", "venv", ".venv"])

type ArchiveKind = "zip" | "tar" | "7z" | "unknown"

async function exists(cmd: string) {
  const r = await safeExec(process.platform === "win32" ? "where" : "which", [cmd], {
    timeoutMs: 5000,
    maxBuffer: 64 * 1024,
  })
  return r.ok
}

function archiveKind(target: string): ArchiveKind {
  const lower = target.toLowerCase()
  if (/\.(zip|jar|war|apk|docx|xlsx|pptx)$/.test(lower)) return "zip"
  if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$/.test(lower)) return "tar"
  if (/\.(7z|rar)$/.test(lower)) return "7z"
  return "unknown"
}

function cleanName(name: string) {
  return (
    name
      .replace(/\.(tar\.gz|tar\.bz2|tar\.xz|zip|jar|war|apk|docx|xlsx|pptx|tgz|tbz2|txz|7z|rar)$/i, "")
      .replace(/[^A-Za-z0-9_.-]+/g, "_")
      .slice(0, 80) || "archive"
  )
}

function isDangerousMember(name: string) {
  const normalized = name.replace(/\\/g, "/")
  if (!normalized || normalized.includes("\0")) return true
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return true
  return normalized.split("/").some((part) => part === "..")
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
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error("zip EOCD not found")
    const entries = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
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
  await safeExec("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, target, outDir], {
    timeoutMs: 120000,
    maxBuffer: MAX_OUTPUT,
  })
  return "powershell-zip"
}

async function listArchive(target: string, kind: ArchiveKind) {
  function parseOutput(r: { ok: boolean; output: string }) {
    if (!r.ok) return [] as string[]
    const text = r.output === "<no output>" ? "" : r.output
    return text
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
  }

  if (kind === "zip") {
    try {
      return await listZipNative(target)
    } catch {}
    if (await exists("unzip")) {
      const r = await safeExec("unzip", ["-Z", "-1", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
      const names = parseOutput(r)
      if (names.length) return names
    }
    if (await exists("7z")) {
      const r = await safeExec("7z", ["l", "-ba", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
      if (r.ok) return parse7zList(r.output)
    }
    if (await exists("jar")) {
      const r = await safeExec("jar", ["tf", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
      const names = parseOutput(r)
      if (names.length) return names
    }
  }
  if (kind === "tar") {
    if (await exists("tar")) {
      const r = await safeExec("tar", ["-tf", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
      return parseOutput(r)
    }
  }
  if ((kind === "7z" || kind === "unknown") && (await exists("7z"))) {
    const r = await safeExec("7z", ["l", "-ba", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
    if (r.ok) return parse7zList(r.output)
  }
  throw new Error(`no supported listing backend for archive kind ${kind}`)
}

async function extractArchive(target: string, kind: ArchiveKind, outDir: string) {
  if (kind === "zip") {
    try {
      return await powershellZip(target, outDir)
    } catch {}
    if (await exists("unzip")) {
      const r = await safeExec("unzip", ["-q", target, "-d", outDir], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
      if (r.ok) return "unzip"
    }
    if (await exists("7z")) {
      const r = await safeExec("7z", ["x", target, `-o${outDir}`, "-y"], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
      if (r.ok) return "7z"
    }
    if (await exists("jar")) {
      const r = await safeExec("jar", ["xf", target], { cwd: outDir, timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
      if (r.ok) return "jar"
    }
  }
  if (kind === "tar" && (await exists("tar"))) {
    const r = await safeExec("tar", ["-xf", target, "-C", outDir], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
    if (r.ok) return "tar"
  }
  if (await exists("7z")) {
    const r = await safeExec("7z", ["x", target, `-o${outDir}`, "-y"], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
    if (r.ok) return "7z"
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

function fileHints(rel: string, sample: Buffer) {
  const lower = rel.toLowerCase()
  const text = sample.toString("latin1").toLowerCase()
  const hints: string[] = []
  if (
    /package\.json|requirements\.txt|pom\.xml|dockerfile|compose|routes?|controllers?|templates?|\.php|\.jsp|\.html|\.js|\.ts|\.java/.test(
      lower,
    )
  )
    hints.push("source/code")
  if (/readme|license|changelog|docs?/.test(lower)) hints.push("docs")
  if (/\.env|config|secret|token|key|credential/.test(lower) || /secret|token|password|apikey/.test(text))
    hints.push("config/secret-like")
  if (/\.(zip|jar|war|7z|rar|tar|gz)$/.test(lower)) hints.push("nested-archive")
  return hints
}

async function inspectExtracted(outDir: string, maxFiles: number, maxBytes: number) {
  const files = await collectFiles(outDir, maxFiles)
  const results: { rel: string; size: number; hints: string[] }[] = []
  let totalBytes = 0
  for (const file of files) {
    const st = await stat(file)
    if (!st.isFile()) continue
    totalBytes += st.size
    if (totalBytes > maxBytes) break
    const fd = await open(file, "r")
    try {
      const buf = Buffer.alloc(Math.min(st.size, 64 * 1024))
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      const sample = buf.subarray(0, bytesRead)
      const rel = path.relative(outDir, file)
      results.push({ rel, size: st.size, hints: fileHints(rel, sample) })
    } finally {
      await fd.close()
    }
  }
  return { results, totalBytes, truncatedByBytes: totalBytes > maxBytes }
}

export default tool({
  description:
    "Safe archive extraction for daily development: list members, block path traversal, extract into extracted/<archive-name>/ inside workspace, and summarize extracted files.",
  args: {
    target: tool.schema.string().describe("Archive path to list and safely extract"),
    out: tool.schema.string().default("extracted").describe("Relative output root. Default: extracted"),
    maxFiles: tool.schema.number().optional().describe("Maximum archive members/files to inspect. Default 500."),
    maxBytes: tool.schema.number().optional().describe("Maximum extracted bytes to inspect. Default 104857600."),
    overwrite: tool.schema
      .boolean()
      .optional()
      .describe("Remove existing output directory before extraction. Default false."),
  },
  async execute(args, context) {
    const targetArg = typeof args.target === "string" && args.target.trim() ? args.target : ""
    if (!targetArg) throw new Error("target is required")
    const outArg = typeof args.out === "string" && args.out.trim() ? args.out : "extracted"

    const target = resolveInsideWorkspace(context.directory, targetArg)
    await access(target)
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 500, 5000))
    const maxBytes = Math.max(1024 * 1024, Math.min(args.maxBytes ?? 100 * 1024 * 1024, 1024 * 1024 * 1024))
    const kind = archiveKind(target)
    const baseOut = resolveInsideWorkspace(context.directory, outArg)
    const outDir = path.join(baseOut, cleanName(path.basename(target)))
    const relOut = path.relative(context.directory, outDir)
    if (relOut.startsWith("..") || path.isAbsolute(relOut))
      throw new Error("output directory must stay inside the current workspace")

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
      ].join("\n")
    }

    if (args.overwrite) await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })
    const backend = await extractArchive(target, kind, outDir)
    const inspected = await inspectExtracted(outDir, maxFiles, maxBytes)
    const highlighted = inspected.results.filter((r) => r.hints.length).slice(0, 80)
    const tree = inspected.results
      .slice(0, 120)
      .map((r) => `${r.rel}\t${r.size} bytes${r.hints.length ? `\t${r.hints.join(",")}` : ""}`)
    const next: string[] = []
    if (highlighted.some((r) => r.hints.includes("source/code")))
      next.push("inspect extracted source/code files in the output directory")
    if (highlighted.some((r) => r.hints.includes("config/secret-like")))
      next.push("review highlighted config files carefully and avoid exposing secrets")
    if (highlighted.some((r) => r.hints.includes("nested-archive")))
      next.push("run archive-safe-extract again on nested archives if needed")
    if (!next.length) next.push("inspect extracted files under the output directory")

    return [
      `target: ${target}`,
      `archive_kind: ${kind}`,
      `backend: ${backend}`,
      `output: ${outDir}`,
      "status: extracted",
      `members_listed: ${members.length}`,
      `files_inspected: ${inspected.results.length}`,
      `total_bytes_seen: ${inspected.totalBytes}`,
      `truncated_by_bytes: ${inspected.truncatedByBytes}`,
      "highlighted_files:",
      ...(highlighted.length ? highlighted.map((r) => `- ${r.rel}: ${r.hints.join(",")}`) : ["- none"]),
      "tree:",
      ...(tree.length ? tree : ["- none"]),
      "next_actions:",
      ...next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
