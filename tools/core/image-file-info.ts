import { tool } from "@opencode-ai/plugin"
import path from "node:path"
import { stat, open } from "node:fs/promises"
import { safeExecWithStreams } from "../lib/exec-utils.ts"
import {
  directoryFromContext,
  resolveFromDirectoryInsideWorkspace,
  workspaceRootFromContext,
} from "../lib/workspace-path.ts"
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

async function optionalExec(cmd: string, args: string[], cwd: string) {
  const { stdout, stderr, ok } = await safeExecWithStreams(cmd, args, { cwd, timeoutMs: 10000, maxBuffer: 512 * 1024 })
  if (!ok) return `<${cmd} unavailable or failed: ${stderr || "no details"}>`
  return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim() || "<no output>"
}

export default tool({
  description:
    "Daily image/document file info: inspect local image-like files without model vision input; reports type, metadata hints, trailing data, and optional exiftool output.",
  args: {
    target: tool.schema.string().describe("Workspace-relative image/document path to inspect"),
    exif: tool.schema.boolean().optional().describe("Run exiftool if available. Default true."),
  },
  async execute(args, context) {
    const workspace = workspaceRootFromContext(context)
    const directory = directoryFromContext(context)
    const target = resolveFromDirectoryInsideWorkspace(directory, workspace, args.target)
    const st = await stat(target)
    const fd = await open(target, "r")
    let sample: Buffer
    try {
      sample = Buffer.alloc(Math.min(st.size, 512 * 1024))
      const { bytesRead } = await fd.read(sample, 0, sample.length, 0)
      sample = sample.subarray(0, bytesRead)
    } finally {
      await fd.close()
    }
    const kind = detect(sample)
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
      "dimensions: use exiftool output when available; mature image metadata is not parsed locally",
      "hints:",
      ...(hints.length ? hints.map((x) => `- ${x}`) : ["- none"]),
      "metadata_exiftool:",
      exifOut.split(/\r?\n/).slice(0, 80).join("\n"),
      "next_actions:",
      "- For visual understanding, use ctf-forensics-analyze first; then ctf-multimodal-triage so a vision-capable model receives a bounded image attachment alongside this metadata.",
      "- For daily engineering work, use exiftool metadata/hints to decide whether manual viewing is needed.",
      "- For CTF/stego tasks, use ctf-multimodal-triage first for visual evidence, then ctf-stego-probe only after the artifact is clearly stego-shaped.",
    ].join("\n")
  },
})
