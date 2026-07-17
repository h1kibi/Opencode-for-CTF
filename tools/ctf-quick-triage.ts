import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, open, readdir, readFile } from "node:fs/promises"
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

const SAMPLE_BYTES = 256 * 1024
const FULL_TEXT_BYTES = 1024 * 1024
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g
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
const TEXT_EXT =
  /\.(txt|md|py|js|mjs|cjs|ts|tsx|jsx|json|yaml|yml|toml|ini|env|html|css|php|java|kt|go|rs|c|cc|cpp|h|hpp|sage|sh|sql|xml|log|conf|cfg|properties|gradle|Dockerfile)$/i
const ARCHIVE_EXT = /\.(zip|jar|war|apk|docx|xlsx|pptx|7z|rar|tar|tar\.gz|tgz|gz|bz2|xz)$/i
const MEDIA_EXT = /\.(png|jpg|jpeg|gif|bmp|wav|mp3|mp4|pdf|pcap|pcapng|raw|mem|img|iso)$/i
const BINARY_EXT = /\.(elf|exe|dll|so|bin|out)$/i

const HIGH_VALUE_PATTERNS = [
  /^readme/i,
  /^docker-compose\.ya?ml$/i,
  /^compose\.ya?ml$/i,
  /^dockerfile$/i,
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /^pnpm-lock\.yaml$/i,
  /^yarn\.lock$/i,
  /^requirements\.txt$/i,
  /^pyproject\.toml$/i,
  /^pom\.xml$/i,
  /^build\.gradle/i,
  /^go\.mod$/i,
  /^cargo\.toml$/i,
  /^composer\.json$/i,
  /^app\.py$/i,
  /^main\.py$/i,
  /^server\.(js|ts)$/i,
  /^index\.(js|ts|php|py)$/i,
  /^manage\.py$/i,
  /^settings\.py$/i,
  /^config\.(js|ts|json|php|py|ya?ml)$/i,
  /^\.env(\.example|\.sample)?$/i,
  /routes?/i,
  /controllers?/i,
  /templates?/i,
  /views?/i,
  /models?/i,
  /flag/i,
  /secret/i,
  /challenge|chall|vuln|pwn|rev|crypto/i,
]

type FileInfo = {
  path: string
  rel: string
  size: number
  magic?: string
  entropy?: number
  sha256?: string
  strings?: string[]
  flags?: string[]
  routeHints: string[]
  priority: number
}

function relDepth(rel: string) {
  return rel.split(/[\\/]+/).filter(Boolean).length
}

function priorityScore(rel: string) {
  const base = path.basename(rel)
  const lower = rel.toLowerCase()
  let score = 0
  for (const pattern of HIGH_VALUE_PATTERNS) if (pattern.test(base) || pattern.test(rel)) score += 20
  if (/^(src|app|server|routes?|controllers?|templates?|views?|api|lib|www|public|static)([\\/]|$)/i.test(rel))
    score += 8
  if (TEXT_EXT.test(base)) score += 5
  if (ARCHIVE_EXT.test(base) || MEDIA_EXT.test(base) || BINARY_EXT.test(base)) score += 7
  if (/\.map$/i.test(base) || /sourcemap/i.test(lower)) score += 6
  if (/test|spec|example|sample|backup|bak|old|dev|debug/i.test(lower)) score += 4
  score -= Math.max(0, relDepth(rel) - 2) * 2
  return score
}

function entropy(buf: Buffer) {
  if (!buf.length) return 0
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
  return Array.from(text.matchAll(/[ -~]{5,}/g), (m) => m[0]).slice(0, 80)
}

function scoreHints(name: string, sample: Buffer, strings: string[]) {
  const lower = name.toLowerCase()
  const joined = strings.join("\n").toLowerCase()
  const hints = new Set<string>()
  if (
    /package\.json|requirements\.txt|pyproject\.toml|pom\.xml|go\.mod|composer\.json|routes?|controllers?|templates?|flask|django|fastapi|express|spring|servlet|jwt|cookie|session|csrf|graphql|api\//.test(
      joined,
    ) ||
    /\.(html|php|jsp|js|ts|war|jar)$/i.test(lower)
  )
    hints.add("web")
  if (
    /\.elf|\.so$|\.exe$|\.dll$/.test(lower) ||
    sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    sample.subarray(0, 2).toString() === "MZ"
  )
    hints.add("pwn/rev")
  if (
    /rsa|ecc|aes|nonce|cipher|encrypt|decrypt|modulus|private key|public key|\bn\s*[:=]|\be\s*[:=]|\bc\s*[:=]/.test(
      joined,
    )
  )
    hints.add("crypto")
  if (
    /\.pcap|\.pcapng|\.mem|\.raw|\.vmdk|\.img|\.iso|\.docx|\.pdf|\.png|\.jpg|\.jpeg|\.wav|\.zip|\.7z|\.rar|\.tar|\.gz/.test(
      lower,
    )
  )
    hints.add("forensics")
  if (/jail|sandbox|game|blockchain|solidity|wasm|protobuf|qr|captcha|maze/.test(joined)) hints.add("misc")
  if (/sourceMappingURL|\.map$/.test(joined) || /\.map$/i.test(lower)) hints.add("source-map")
  return Array.from(hints)
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
  const candidates = await collectCandidates(root, Math.max(maxFiles * 8, 800))
  return candidates
    .map((file) => ({ file, rel: path.relative(root, file) || path.basename(file) }))
    .sort(
      (a, b) =>
        priorityScore(b.rel) - priorityScore(a.rel) || relDepth(a.rel) - relDepth(b.rel) || a.rel.localeCompare(b.rel),
    )
    .slice(0, maxFiles)
    .map((x) => x.file)
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

function topScores(infos: FileInfo[]) {
  const scores: Record<string, number> = { web: 0, pwn: 0, rev: 0, crypto: 0, forensics: 0, misc: 0 }
  for (const info of infos) {
    for (const hint of info.routeHints) {
      if (hint === "web" || hint === "source-map") scores.web += 3
      if (hint === "pwn/rev") {
        scores.pwn += 2
        scores.rev += 2
      }
      if (hint === "crypto") scores.crypto += 4
      if (hint === "forensics") scores.forensics += 3
      if (hint === "misc") scores.misc += 2
    }
    const rel = info.rel.toLowerCase()
    if (
      /dockerfile|compose|requirements|pyproject|package\.json|pom\.xml|templates?|routes?|controllers?|app\.py|server\.js|index\.php|\.map$/.test(
        rel,
      )
    )
      scores.web += 2
    if (/checksec|libc|ld-linux|vuln|chall|pwn|\.so$/.test(rel)) scores.pwn += 2
    if (/main|crack|license|keygen|apk|dex|\.so$|exe$|elf$/.test(rel)) scores.rev += 2
    if (/rsa|cipher|crypto|encrypt|decrypt|public|private|nonce/.test(rel)) scores.crypto += 2
    if (/pcap|mem|raw|img|iso|steg|png|jpg|wav|zip|7z|docx|pdf/.test(rel)) scores.forensics += 2
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1])
}

function archiveHint(file: string, magic: string) {
  const lower = file.toLowerCase()
  if (/\.(zip|jar|war|apk|docx|xlsx|pptx)$/.test(lower) || magic.startsWith("50 4b"))
    return "zip-like: use ctf-safe-extract first"
  if (/\.7z$/.test(lower) || magic.startsWith("37 7a bc af 27 1c")) return "7z archive: use ctf-safe-extract first"
  if (/(\.tar|\.tar\.gz|\.tgz|\.gz|\.bz2|\.xz)$/.test(lower)) return "tar/compressed: use ctf-safe-extract first"
  if (/\.(png|jpg|jpeg|wav|bmp|gif)$/.test(lower))
    return "media/stego candidate: run ctf-stego-probe before heavy carving"
  if (/\.(pcap|pcapng)$/.test(lower)) return "packet capture: run ctf-pcap-probe before manual tshark"
  return undefined
}

function shouldTrustDirectFlagHit(file: string, sample: Buffer, textual: boolean) {
  const lower = file.toLowerCase()
  if (textual) return true
  if (/\.(txt|md|json|yaml|yml|ini|cfg|log|conf|py|js|ts|php|java|c|cpp|h|html|xml|sql|sage|sh)$/i.test(lower))
    return true
  if (/\.(zip|jar|war|apk|docx|xlsx|pptx|7z|rar|tar|tar\.gz|tgz|gz|bz2|xz)$/i.test(lower)) return false
  if (/\.(png|jpg|jpeg|gif|bmp|wav|mp3|mp4|pdf|pcap|pcapng|raw|mem|img|iso)$/i.test(lower)) return false
  if (sample.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return false
  return false
}

function webSourceHint(rel: string, text: string) {
  const lower = `${rel}\n${text.slice(0, 20000)}`.toLowerCase()
  if (
    /app\.py|server\.(js|ts)|index\.php|routes?|controllers?|templates?|dockerfile|package\.json|requirements\.txt|pom\.xml|spring|flask|express|django|fastapi|laravel|servlet/.test(
      lower,
    )
  ) {
    return `${rel}: web source indicator; run ctf-web-source-map before manual route review`
  }
  return undefined
}

function remoteEndpointHint(rel: string, text: string) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (
      /remote\s*\(\s*["'][^"']+["']\s*,\s*\d{2,5}\s*\)/i.test(trimmed) ||
      /\bnc\s+[^\s]+\s+\d{2,5}\b/i.test(trimmed) ||
      /\b(?:host|server|remote)\s*[:=]\s*[^\s:]+\b/i.test(trimmed) ||
      /\b[A-Za-z0-9.-]+:\d{2,5}\b/.test(trimmed)
    ) {
      return `${rel}: remote endpoint clue; ${trimmed.slice(0, 160)}`
    }
  }
  return undefined
}

function looksLikePwnArchive(rel: string) {
  return /(?:^|[\\/])(chall|challenge|pwn|vuln|rop|fmt|heap|baby|main|bin|elf)[^\\/]*\.(zip|jar|7z|rar|tar|tgz|gz)$/i.test(
    rel,
  )
}

export default tool({
  description:
    "CTF quick triage: prioritized one-shot inventory, flag grep, archive/RSA/web/pwn/rev/crypto/forensics scoring, and recommended next actions for fast routing.",
  args: {
    target: tool.schema.string().default(".").describe("File or directory path to triage"),
    maxFiles: tool.schema.number().optional().describe("Maximum files to inspect. Default 160."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const maxFiles = Math.max(1, Math.min(args.maxFiles ?? 160, 700))
    const rootStat = await lstat(target)
    const files = rootStat.isDirectory() ? await collectFiles(target, maxFiles) : [target]
    const infos: FileInfo[] = []
    const allFlags: string[] = []
    const archiveHints: string[] = []
    const rsaHints: string[] = []
    const webSourceHints: string[] = []
    const binaryHints: string[] = []
    const sourceMapHints: string[] = []
    const remoteHints: string[] = []

    for (const file of files) {
      const stat = await lstat(file)
      if (!stat.isFile()) continue
      const rel = path.relative(target, file) || path.basename(file)
      const sample = await readHeadTail(file, stat.size)
      const strings = printableStrings(sample)
      const magic =
        sample
          .subarray(0, 16)
          .toString("hex")
          .match(/.{1,2}/g)
          ?.join(" ") ?? ""
      const text = await safeReadText(file, stat.size, sample)
      const textual = looksTextual(file, sample)
      const directFlagTrusted = shouldTrustDirectFlagHit(file, sample, textual)
      const flags = directFlagTrusted ? Array.from(new Set<string>(text.match(FLAG_RE) ?? [])).slice(0, 20) : []
      for (const flag of flags) allFlags.push(`${rel}: ${flag}`)
      const ah = archiveHint(file, magic)
      if (ah) archiveHints.push(`${rel}: ${ah}`)
      if (!directFlagTrusted && /\.(zip|jar|war|apk|docx|xlsx|pptx|7z|rar|tar|tar\.gz|tgz|gz|bz2|xz)$/i.test(rel)) {
        sourceMapHints.push(
          `${rel}: archive/container text was not trusted for direct flag hits; prefer extraction before declaring direct_flag`,
        )
      }
      if (
        /\b(n|e|c|p|q|dp|dq|phi)\d*\b\s*[:=]\s*(0x[0-9a-fA-F]+|\d+)/.test(text) ||
        /BEGIN (RSA )?(PUBLIC|PRIVATE) KEY/.test(text)
      ) {
        rsaHints.push(`${rel}: RSA-like parameters/key material present; run ctf-rsa-probe`)
      }
      const wsh = webSourceHint(rel, text)
      if (wsh) webSourceHints.push(wsh)
      const reh = remoteEndpointHint(rel, text)
      if (reh) remoteHints.push(reh)
      if (/sourceMappingURL=|\.map$/i.test(`${rel}\n${text.slice(0, 10000)}`))
        sourceMapHints.push(`${rel}: source map indicator; fetch/review map before fuzzing`)
      if (
        BINARY_EXT.test(rel) ||
        sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
        sample.subarray(0, 2).toString() === "MZ"
      ) {
        binaryHints.push(`${rel}: binary candidate; run ctf-binary-probe`)
      }

      infos.push({
        path: file,
        rel,
        size: stat.size,
        magic,
        entropy: entropy(sample),
        sha256: stat.size <= 8 * 1024 * 1024 ? await sha256File(file) : undefined,
        strings: strings.slice(0, 8),
        flags,
        routeHints: scoreHints(file, sample, strings),
        priority: priorityScore(rel),
      })
    }

    const scores = topScores(infos)
    const best = scores[0]
    const next: string[] = []
    const firstRel = (line: string) => line.split(":", 1)[0] || "."
    const pwnArchiveHints = archiveHints.filter((x) => looksLikePwnArchive(firstRel(x)))
    const pwnBundlePreferred =
      archiveHints.length > 0 && remoteHints.length > 0 && (binaryHints.length > 0 || pwnArchiveHints.length > 0)
    if (allFlags.length)
      next.push(
        "verify the top flag hit with at most one read/grep action, then write only the verified flag to agent_flag.txt",
      )
    if (archiveHints.length)
      next.push(
        "run ctf-safe-extract once on archive-like files, then rerun ctf-quick-triage on extracted output if needed",
      )
    if (rsaHints.length) next.push("run ctf-rsa-probe on the RSA-like file/text before spawning ctf-crypto")
    if (webSourceHints.length || sourceMapHints.length)
      next.push("run ctf-web-source-map on the source tree before manual Web review")
    if (binaryHints.length) next.push("run ctf-binary-probe before manual checksec/readelf/strings sequences")
    if (pwnBundlePreferred)
      next.push(
        "treat the archive + remote-endpoint bundle as PWN-first: extract once, then run ctf-pwn-fast-bootstrap or ctf-binary-probe on the extracted ELF before archive/forensics branching",
      )
    if (best?.[0] === "web") next.push("inspect manifest, routes, config, templates, and entrypoint before broad grep")
    if (best?.[0] === "pwn") next.push("find crash/control/leak primitive, then write exploit.py")
    if (best?.[0] === "rev") next.push("start static: strings/imports/main/constants, then derive solve.py")
    if (best?.[0] === "forensics")
      next.push("use ctf-pcap-probe/ctf-stego-probe/metadata before heavier carving or volatility")
    if (!next.length) next.push("start with highest-score category or inspect the largest/most suspicious files")

    let verdict = best?.[0] ?? "unknown"
    let confidence = best && best[1] >= 6 ? "medium" : "low"
    let nextTool = "none"
    let nextTarget = "."
    let spawnSubagent = "maybe"
    let directSolve = "no"
    if (allFlags.length) {
      verdict = "direct_flag"
      confidence = "high"
      nextTool = "none"
      nextTarget = firstRel(allFlags[0])
      spawnSubagent = "no"
      directSolve = "yes"
    } else if (pwnBundlePreferred) {
      verdict = "pwn_bundle"
      confidence = "high"
      nextTool = "ctf-safe-extract"
      nextTarget = firstRel(pwnArchiveHints[0] || archiveHints[0])
      spawnSubagent = "no"
    } else if (archiveHints.length) {
      verdict = "archive_or_media"
      confidence = "high"
      nextTool = archiveHints[0].includes("packet capture")
        ? "ctf-pcap-probe"
        : archiveHints[0].includes("media/stego")
          ? "ctf-stego-probe"
          : "ctf-safe-extract"
      nextTarget = firstRel(archiveHints[0])
      spawnSubagent = "no"
    } else if (rsaHints.length) {
      verdict = "rsa"
      confidence = "high"
      nextTool = "ctf-rsa-probe"
      nextTarget = firstRel(rsaHints[0])
      spawnSubagent = "no"
    } else if (sourceMapHints.length || webSourceHints.length) {
      verdict = "web_source"
      confidence = "medium"
      nextTool = "ctf-web-source-map"
      nextTarget = "."
      spawnSubagent = "no"
    } else if (binaryHints.length) {
      verdict = "binary"
      confidence = "medium"
      nextTool = "ctf-binary-probe"
      nextTarget = firstRel(binaryHints[0])
      spawnSubagent = "no"
    }

    const tree = infos
      .slice(0, 90)
      .map(
        (i) =>
          `${i.rel}\t${i.size} bytes\tpri=${i.priority}\t${i.routeHints.join(",") || "-"}\tH=${i.entropy?.toFixed(2)}`,
      )
    const highlights = infos
      .filter((i) => i.routeHints.length || i.flags?.length || i.priority >= 18)
      .slice(0, 36)
      .map(
        (i) => `${i.rel}: hints=${i.routeHints.join(",") || "-"}; strings=${(i.strings ?? []).slice(0, 3).join(" | ")}`,
      )

    return [
      `target: ${target}`,
      `files_inspected: ${infos.length}/${files.length}`,
      `category_scores: ${scores.map(([k, v]) => `${k}=${v}`).join(", ")}`,
      `verdict: ${verdict}`,
      `confidence: ${confidence}`,
      `next_tool: ${nextTool}`,
      `next_target: ${nextTarget}`,
      `spawn_subagent: ${spawnSubagent}`,
      `direct_solve: ${directSolve}`,
      "flag_hits:",
      ...(allFlags.length ? allFlags.slice(0, 50).map((x) => `- ${x}`) : ["- none"]),
      "archive_or_media_hints:",
      ...(archiveHints.length ? archiveHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "rsa_hints:",
      ...(rsaHints.length ? rsaHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "web_source_hints:",
      ...(webSourceHints.length ? webSourceHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "remote_endpoint_hints:",
      ...(remoteHints.length ? remoteHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "binary_hints:",
      ...(binaryHints.length ? binaryHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "source_map_hints:",
      ...(sourceMapHints.length ? sourceMapHints.slice(0, 30).map((x) => `- ${x}`) : ["- none"]),
      "top_tree:",
      ...tree.map((x) => `- ${x}`),
      "highlights:",
      ...(highlights.length ? highlights.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...Array.from(new Set(next))
        .slice(0, 6)
        .map((x) => `- ${x}`),
    ].join("\n")
  },
})
