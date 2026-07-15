import { tool } from "@opencode-ai/plugin"
import { lstat, open, readFile } from "node:fs/promises"
import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"
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


const execFile = promisify(execFileCb)
const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

const SIGNATURES: Array<[string, Buffer]> = [
  ["zip", Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  ["zip_eocd", Buffer.from([0x50, 0x4b, 0x05, 0x06])],
  ["rar", Buffer.from([0x52, 0x61, 0x72, 0x21])],
  ["7z", Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])],
  ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ["jpg", Buffer.from([0xff, 0xd8, 0xff])],
  ["gzip", Buffer.from([0x1f, 0x8b])],
  ["pdf", Buffer.from("%PDF-")],
]

async function safeExec(cmd: string, args: string[], cwd: string, ms = 8000) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { cwd, timeout: ms, maxBuffer: 1024 * 1024 })
    const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim()
    return out || "<no output>"
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = `${e.stdout ?? ""}${e.stderr ? `\n[stderr]\n${e.stderr}` : ""}`.trim()
    return out || `<failed: ${e.message ?? String(err)}>`
  }
}

async function readHeadTail(file: string, size: number, bytes = 2 * 1024 * 1024) {
  const fd = await open(file, "r")
  try {
    if (size <= bytes) {
      const b = Buffer.alloc(size)
      const r = await fd.read(b, 0, size, 0)
      return b.subarray(0, r.bytesRead)
    }
    const half = Math.floor(bytes / 2)
    const head = Buffer.alloc(half)
    const tail = Buffer.alloc(half)
    const hr = await fd.read(head, 0, half, 0)
    const tr = await fd.read(tail, 0, half, Math.max(0, size - half))
    return Buffer.concat([head.subarray(0, hr.bytesRead), tail.subarray(0, tr.bytesRead)])
  } finally {
    await fd.close()
  }
}

function findSignatures(buf: Buffer) {
  const hits: string[] = []
  for (const [name, sig] of SIGNATURES) {
    let start = 0
    let count = 0
    while (count < 10) {
      const idx = buf.indexOf(sig, start)
      if (idx < 0) break
      hits.push(`${name}@sample_offset_${idx}`)
      start = idx + 1
      count++
    }
  }
  return hits
}

function trailingDataHint(fullOrSample: Buffer, size: number) {
  const hints: string[] = []
  const pngEnd = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  const pngIdx = fullOrSample.indexOf(pngEnd)
  if (pngIdx >= 0 && pngIdx + pngEnd.length < fullOrSample.length) hints.push(`png trailing data after sample offset ${pngIdx + pngEnd.length}`)
  const jpgIdx = fullOrSample.lastIndexOf(Buffer.from([0xff, 0xd9]))
  if (jpgIdx >= 0 && jpgIdx + 2 < fullOrSample.length) hints.push(`jpeg trailing data after sample offset ${jpgIdx + 2}`)
  const eocdIdx = fullOrSample.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdIdx >= 0 && eocdIdx + 22 < fullOrSample.length) hints.push(`zip-like trailing/overlay data around sample offset ${eocdIdx + 22}`)
  if (size > fullOrSample.length) hints.push("large file sampled only; run binwalk/exiftool or targeted extraction if hints look promising")
  return hints
}

function printableStrings(buf: Buffer) {
  return Array.from(buf.toString("latin1").matchAll(/[ -~]{4,}/g), (m) => m[0])
}

export default tool({
  description: "CTF stego/media probe: fast metadata, signature, trailing-data, embedded-archive, strings, binwalk/zsteg availability hints without slow brute force.",
  args: {
    target: tool.schema.string().describe("Media/document/archive-like file path to probe"),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const cwd = path.dirname(target)
    const stat = await lstat(target)
    const sample = await readHeadTail(target, stat.size)
    const strings = printableStrings(sample)
    const flagHits = Array.from(new Set(strings.flatMap((s) => s.match(FLAG_RE) ?? []))).slice(0, 50)
    const secretStrings = Array.from(new Set(strings.filter((s) => /flag|secret|password|token|key|ctf|base64|hidden/i.test(s)))).slice(0, 80)
    const signatureHits = findSignatures(sample)
    const trailingHints = trailingDataHint(sample, stat.size)

    const fileOut = await safeExec("file", [target], cwd)
    const exifOut = await safeExec("exiftool", [target], cwd, 8000)
    const binwalkOut = await safeExec("binwalk", [target], cwd, 8000)
    const zstegOut = /\.(png|bmp)$/i.test(target) ? await safeExec("zsteg", [target], cwd, 8000) : "skipped_non_png_bmp"

    const recommended: string[] = []
    if (flagHits.length) recommended.push("verify flag-like string hits immediately")
    if (trailingHints.length) recommended.push("extract/inspect trailing data before trying LSB brute force")
    if (signatureHits.some((x) => /zip|rar|7z|gzip|pdf/.test(x))) recommended.push("embedded file signature found: carve/extract that offset")
    if (!binwalkOut.startsWith("<failed") && /Zip|RAR|7-zip|gzip|PNG|JPEG|compressed|filesystem/i.test(binwalkOut)) recommended.push("binwalk shows embedded/compressed object; extract only relevant offsets")
    if (!zstegOut.startsWith("<failed") && !/nothing|skipped/i.test(zstegOut)) recommended.push("zsteg produced output; verify high-signal rows first")
    if (!recommended.length) recommended.push("metadata/strings/signatures first; only then consider LSB or password guessing")

    return [
      `target: ${target}`,
      `size: ${stat.size}`,
      `verdict: ${flagHits.length ? "direct_flag" : "stego_media"}`,
      `confidence: ${flagHits.length || signatureHits.length || trailingHints.length ? "high" : "medium"}`,
      `next_tool: none`,
      `next_target: ${path.basename(target)}`,
      `spawn_subagent: ${flagHits.length ? "no" : "maybe"}`,
      `direct_solve: ${flagHits.length ? "yes" : "no"}`,
      "file:",
      fileOut,
      "metadata_exiftool:",
      exifOut.split(/\r?\n/).slice(0, 80).join("\n"),
      "signature_hits_in_sample:",
      ...(signatureHits.length ? signatureHits.map((x) => `- ${x}`) : ["- none"]),
      "trailing_data_hints:",
      ...(trailingHints.length ? trailingHints.map((x) => `- ${x}`) : ["- none"]),
      "binwalk:",
      binwalkOut.split(/\r?\n/).slice(0, 80).join("\n"),
      "zsteg:",
      zstegOut.split(/\r?\n/).slice(0, 80).join("\n"),
      "flag_hits:",
      ...(flagHits.length ? flagHits.map((x) => `- ${x}`) : ["- none"]),
      "secret_like_strings:",
      ...(secretStrings.length ? secretStrings.map((x) => `- ${x}`) : ["- none"]),
      "recommended_next:",
      ...recommended.slice(0, 6).map((x) => `- ${x}`),
    ].join("\n")
  },
})
