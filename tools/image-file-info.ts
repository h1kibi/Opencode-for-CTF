import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { safeExecWithStreams } from "./lib/exec-utils.ts"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

function detect(buf: Buffer) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg"
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")
    return "gif"
  if (buf.subarray(0, 2).toString("ascii") === "BM") return "bmp"
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
  if (buf.subarray(0, 4).toString("ascii") === "%PDF") return "pdf"
  return "unknown"
}

function dimensions(kind: string, buf: Buffer) {
  try {
    if (kind === "png" && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    if (kind === "gif" && buf.length >= 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    if (kind === "bmp" && buf.length >= 26) return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) }
    if (kind === "jpeg") {
      let off = 2
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) {
          off++
          continue
        }
        const marker = buf[off + 1]
        const len = buf.readUInt16BE(off + 2)
        if (marker >= 0xc0 && marker <= 0xc3)
          return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) }
        off += 2 + len
      }
    }
  } catch {}
  return undefined
}

async function optionalExec(cmd: string, args: string[], cwd: string) {
  const { stdout, stderr, ok } = await safeExecWithStreams(cmd, args, { cwd, timeoutMs: 10000, maxBuffer: 512 * 1024 })
  if (!ok) return `<${cmd} unavailable or failed: ${stderr || "no details"}>`
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "<no output>"
}

export default tool({
  description:
    "Daily image/document file info: inspect local image-like files without model vision input; reports type, dimensions, metadata hints, trailing data, and optional exiftool output.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image/document path to inspect"),
    exif: tool.schema.boolean().optional().describe("Run exiftool if available. Default true."),
  },
  async execute(args, context) {
    const fs = await import("fs/promises")
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await fs.stat(target)
    const fd = await fs.open(target, "r")
    let sample: Buffer
    try {
      sample = Buffer.alloc(Math.min(st.size, 512 * 1024))
      const { bytesRead } = await fd.read(sample, 0, sample.length, 0)
      sample = sample.subarray(0, bytesRead)
    } finally {
      await fd.close()
    }
    const kind = detect(sample)
    const dim = dimensions(kind, sample)
    const hints: string[] = []
    const pngEnd = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
    const pngIdx = sample.indexOf(pngEnd)
    if (kind === "png" && pngIdx >= 0 && pngIdx + pngEnd.length < sample.length)
      hints.push(`png trailing data after offset ${pngIdx + pngEnd.length}`)
    const jpgIdx = sample.lastIndexOf(Buffer.from([0xff, 0xd9]))
    if (kind === "jpeg" && jpgIdx >= 0 && jpgIdx + 2 < sample.length)
      hints.push(`jpeg trailing data after offset ${jpgIdx + 2}`)
    if (sample.includes(Buffer.from("PK\x03\x04", "binary"))) hints.push("embedded zip signature")
    if (sample.toString("latin1").match(/https?:\/\/|mailto:|BEGIN [A-Z ]+KEY|password|secret|token/i))
      hints.push("interesting text/URL/secret-like string in sample")

    const exifOut = args.exif === false ? "skipped" : await optionalExec("exiftool", [target], path.dirname(target))
    return [
      "# Image File Info",
      `target: ${target}`,
      `size: ${st.size}`,
      `kind: ${kind}`,
      `dimensions: ${dim ? `${dim.width}x${dim.height}` : "unknown"}`,
      "hints:",
      ...(hints.length ? hints.map((x) => `- ${x}`) : ["- none"]),
      "metadata_exiftool:",
      exifOut.split(/\r?\n/).slice(0, 80).join("\n"),
      "next_actions:",
      "- If you need visual understanding, use a vision-capable model or external viewer; current text model cannot read image pixels directly.",
      "- For daily engineering work, use metadata/dimensions/hints to decide whether manual viewing is needed.",
      "- For CTF/stego tasks, switch to ctf-expert (or /ctf) and use ctf-stego-probe.",
    ].join("\n")
  },
})
