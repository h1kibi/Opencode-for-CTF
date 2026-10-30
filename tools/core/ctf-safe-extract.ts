import { tool } from "@opencode-ai/plugin"
import { access, lstat, mkdir, open, readdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { constants as fsConstants } from "node:fs"
import { safeExec } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  resolveInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
import { DEFAULT_FLAG_REGEX } from "ctf-core"

const DEFAULT_FLAG_RE = DEFAULT_FLAG_REGEX
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

async function exists(cmd: string) {
  const r = await safeExec(process.platform === "win32" ? "where" : "which", [cmd], {
    timeoutMs: 5000,
    maxBuffer: 64 * 1024,
  })
  return r.ok
}

async function find7z() {
  if (await exists("7z")) return "7z"
  const candidates = [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "7z.exe"),
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

function parse7zList(stdout: string): string[] {
  const names: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S{5}\s+\d+\s+\d*\s+(.+)$/)
    if (match?.[1]) names.push(match[1].trim())
  }
  return names
}

async function powershellZip(target: string, outDir: string) {
  const result = await safeExec(
    "powershell",
    ["-NoProfile", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", target, outDir],
    { timeoutMs: 120000, maxBuffer: MAX_OUTPUT },
  )
  if (!result.ok) throw new Error(result.output)
  return "powershell-zip"
}

async function listArchive(target: string, kind: ArchiveKind) {
  const parse = (text: string) =>
    (text === "<no output>" ? "" : text)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
  if (kind === "zip" && (await exists("unzip"))) {
    const result = await safeExec("unzip", ["-Z", "-1", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return parse(result.output)
  }
  const sevenZip = await find7z()
  if (sevenZip) {
    const result = await safeExec(sevenZip, ["l", "-ba", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return parse7zList(result.output)
  }
  if (kind === "zip" && (await exists("jar"))) {
    const result = await safeExec("jar", ["tf", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return parse(result.output)
  }
  if (kind === "tar" && (await exists("tar"))) {
    const result = await safeExec("tar", ["-tf", target], { timeoutMs: 30000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return parse(result.output)
  }
  throw new Error(`no supported external listing backend for archive kind ${kind}`)
}

async function extractArchive(target: string, kind: ArchiveKind, outDir: string) {
  if (kind === "zip" && process.platform === "win32") {
    try {
      return await powershellZip(target, outDir)
    } catch {
      /* try other installed backends */
    }
  }
  if ((kind === "zip" || kind === "unknown") && (await exists("unzip"))) {
    const result = await safeExec("unzip", ["-q", target, "-d", outDir], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return "unzip"
  }
  const sevenZip = await find7z()
  if (sevenZip) {
    const result = await safeExec(sevenZip, ["x", target, `-o${outDir}`, "-y"], {
      timeoutMs: 120000,
      maxBuffer: MAX_OUTPUT,
    })
    if (result.ok) return "7z"
  }
  if ((kind === "zip" || kind === "unknown") && (await exists("jar"))) {
    const result = await safeExec("jar", ["xf", target], { cwd: outDir, timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return "jar"
  }
  if (kind === "tar" && (await exists("tar"))) {
    const result = await safeExec("tar", ["-xf", target, "-C", outDir], { timeoutMs: 120000, maxBuffer: MAX_OUTPUT })
    if (result.ok) return "tar"
  }
  throw new Error(`no supported external extraction backend for archive kind ${kind}`)
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
  if (/flag|secret|token|key|admin|debug|backup|\.env|config/.test(lower) || /flag|secret|token|admin|debug/.test(text))
    hints.push("secret/config/flag naming")
  if (
    /package\.json|requirements\.txt|pom\.xml|dockerfile|compose|routes?|controllers?|templates?|\.php|\.jsp|\.html|\.js|\.ts/.test(
      lower,
    )
  )
    hints.push("web/source candidate")
  if (/\.pcapng?$|\.png$|\.jpe?g$|\.wav$|\.pdf$|\.docx$|\.xlsx$|\.pptx$|\.mem$|\.raw$|\.img$/.test(lower))
    hints.push("forensics/media candidate")
  if (/rsa|cipher|crypto|encrypt|decrypt|public|private/.test(lower) || /\bn\s*[:=]|\be\s*[:=]|\bc\s*[:=]/.test(text))
    hints.push("crypto/RSA candidate")
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || sample.subarray(0, 2).toString() === "MZ")
    hints.push("binary candidate")
  return hints
}

function binaryLikeSample(sample: Buffer) {
  if (sample.length === 0) return false
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || sample.subarray(0, 2).toString() === "MZ")
    return true
  let printable = 0
  for (const byte of sample) {
    if (byte === 0 || byte < 9 || (byte > 13 && byte < 32)) return true
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
    const fd = await open(file, "r")
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
  description:
    "CTF safe archive extraction: list members, reject path traversal/absolute paths, extract into extracted/<archive-name>/, then report tree, flag hits, suspicious files, and next actions.",
  args: {
    target: tool.schema.string().describe("Archive path to list and safely extract"),
    out: tool.schema.string().default("extracted").describe("Relative output root. Default: extracted"),
    maxFiles: tool.schema.number().optional().describe("Maximum archive members/files to inspect. Default 500."),
    maxBytes: tool.schema.number().optional().describe("Maximum extracted bytes to inspect. Default 209715200."),
    overwrite: tool.schema
      .boolean()
      .optional()
      .describe("Remove existing output directory before extraction. Default false."),
    flagPattern: tool.schema
      .string()
      .optional()
      .describe("Optional JavaScript regex source for known flag format. Example: DASCTF\\{[^}]+\\}"),
  },
  async execute(args, context) {
    const targetArg = typeof args.target === "string" && args.target.trim() ? args.target : ""
    if (!targetArg) throw new Error("target is required")
    const outArg = typeof args.out === "string" && args.out.trim() ? args.out : "extracted"

    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, targetArg)
    await access(target)
    const flagRegex = makeFlagRegex(args.flagPattern)
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 500, 5000))
    const maxBytes = Math.max(1024 * 1024, Math.min(args.maxBytes ?? 200 * 1024 * 1024, 1024 * 1024 * 1024))
    const kind = archiveKind(target)
    const baseOut = resolveInsideWorkspace(workspace, outArg)
    const outDir = path.join(baseOut, cleanName(path.basename(target)))
    const relOut = path.relative(workspace, outDir)
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
        "recommended_next: raise maxFiles only if the challenge requires it, otherwise inspect listing first",
      ].join("\n")
    }

    if (args.overwrite) await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })
    const backend = await extractArchive(target, kind, outDir)
    const inspected = await inspectExtracted(outDir, maxFiles, maxBytes, flagRegex)
    const flagCandidates = inspected.results
      .filter((r) => !r.binaryLike)
      .flatMap((r) => r.flags.map((flag) => `${r.rel}: ${flag}`))
    const binaryFlagHints = inspected.results
      .filter((r) => r.binaryLike && r.flags.length)
      .flatMap((r) => r.flags.map((flag) => `${r.rel}: ${flag}`))
    const suspicious = inspected.results.filter((r) => r.flags.length || r.suspicious.length).slice(0, 80)
    const tree = inspected.results
      .slice(0, 120)
      .map((r) => `${r.rel}\t${r.size} bytes${r.suspicious.length ? `\t${r.suspicious.join(",")}` : ""}`)
    const next: string[] = []
    if (flagCandidates.length)
      next.push("verify strict text-like flag candidates with an independent oracle before writing agent_flag.txt")
    if (binaryFlagHints.length)
      next.push(
        "binary files contain flag-like bytes; treat them as hints only and verify after source/binary analysis",
      )
    if (suspicious.some((r) => r.suspicious.includes("crypto/RSA candidate")))
      next.push("run ctf-crypto-analyze on crypto/RSA candidates; use ctf-rsa-probe only for a narrower rerun")
    if (suspicious.some((r) => r.suspicious.includes("web/source candidate")))
      next.push(
        "rerun ctf-one-shot-triage on the extracted source directory, then inspect only the top routes/config/templates",
      )
    if (suspicious.some((r) => r.suspicious.includes("forensics/media candidate")))
      next.push("run ctf-forensics-analyze on highlighted media/capture files before manual carving")
    if (!next.length) next.push("rerun ctf-one-shot-triage on the output directory and follow next_tool/next_target")

    return [
      `target: ${target}`,
      `archive_kind: ${kind}`,
      `backend: ${backend}`,
      `output: ${outDir}`,
      `verdict: ${flagCandidates.length ? "flag_candidate" : "archive_extracted"}`,
      `confidence: ${flagCandidates.length || suspicious.length ? "high" : "medium"}`,
      `next_tool: ${flagCandidates.length ? "ctf-evidence-board" : "ctf-one-shot-triage"}`,
      `next_target: ${relOut}`,
      `spawn_subagent: no`,
      `direct_solve: no`,
      `members_listed: ${members.length}`,
      `files_inspected: ${inspected.results.length}`,
      `flag_pattern: ${args.flagPattern ? "custom" : "default"}`,
      `total_bytes_seen: ${inspected.totalBytes}`,
      `truncated_by_bytes: ${inspected.truncatedByBytes}`,
      "flag_hits:",
      ...(flagCandidates.length ? flagCandidates.slice(0, 50).map((x) => `- ${x}`) : ["- none"]),
      "binary_flag_hints:",
      ...(binaryFlagHints.length ? binaryFlagHints.slice(0, 50).map((x) => `- ${x}`) : ["- none"]),
      "suspicious_files:",
      ...(suspicious.length
        ? suspicious.map((r) => `- ${r.rel}: ${r.suspicious.join(",") || "flag hit"}`)
        : ["- none"]),
      "tree:",
      ...tree.map((x) => `- ${x}`),
      "recommended_next:",
      ...next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
