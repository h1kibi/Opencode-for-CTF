import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import crypto from "node:crypto"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function parseBytes(args: any) {
  if (args.hex) return Buffer.from(String(args.hex).replace(/[^0-9a-fA-F]/g, ""), "hex")
  if (args.base64) return Buffer.from(String(args.base64), "base64")
  if (args.text) return Buffer.from(String(args.text), args.encoding || "latin1")
  if (args.repeatByte !== undefined && args.length)
    return Buffer.alloc(Number(args.length), Number(args.repeatByte) & 0xff)
  return Buffer.alloc(0)
}

function qwordViews(buf: Buffer, offsets: number[]) {
  return offsets
    .filter((o) => o >= 0 && o < buf.length)
    .map((o) => {
      const slice = buf.subarray(o, Math.min(o + 8, buf.length))
      const padded = Buffer.concat([slice, Buffer.alloc(Math.max(0, 8 - slice.length))])
      return { offset: o, hex: slice.toString("hex"), qword_le: `0x${padded.readBigUInt64LE(0).toString(16)}` }
    })
}

export default tool({
  description:
    "CTF PWN payload artifact helper: write/patch binary payloads safely and report length, sha256, xxd preview, and qword views.",
  args: {
    output: tool.schema.string().describe("Workspace-relative output payload path."),
    hex: tool.schema.string().optional().describe("Hex bytes to write."),
    base64: tool.schema.string().optional().describe("Base64 bytes to write."),
    text: tool.schema.string().optional().describe("Text bytes to write, default latin1."),
    encoding: tool.schema.string().optional().describe("Encoding for text input. Default latin1."),
    repeatByte: tool.schema.number().optional().describe("Byte value used with length to create filler."),
    length: tool.schema.number().optional().describe("Length used with repeatByte."),
    fromFile: tool.schema
      .string()
      .optional()
      .describe("Optional existing workspace-relative file to load before patches."),
    patchesJson: tool.schema.string().optional().describe("JSON array patches: {offset,hex|base64|text|u64le|u32le}."),
    qwordOffsets: tool.schema.string().optional().describe("Comma/newline offsets to display, decimal or 0x hex."),
    previewBytes: tool.schema.number().optional().describe("Preview bytes. Default 128."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    let buf = args.fromFile
      ? await readFile(resolveInsideWorkspace(context.directory, args.fromFile))
      : parseBytes(args)
    const patches = args.patchesJson ? (JSON.parse(args.patchesJson) as any[]) : []
    for (const p of patches) {
      const off = Number(p.offset)
      let pb: Buffer
      if (p.hex) pb = Buffer.from(String(p.hex).replace(/[^0-9a-fA-F]/g, ""), "hex")
      else if (p.base64) pb = Buffer.from(String(p.base64), "base64")
      else if (p.u64le !== undefined) {
        pb = Buffer.alloc(8)
        pb.writeBigUInt64LE(BigInt(p.u64le))
      } else if (p.u32le !== undefined) {
        pb = Buffer.alloc(4)
        pb.writeUInt32LE(Number(p.u32le) >>> 0)
      } else pb = Buffer.from(String(p.text || ""), p.encoding || "latin1")
      if (off + pb.length > buf.length) buf = Buffer.concat([buf, Buffer.alloc(off + pb.length - buf.length)])
      pb.copy(buf, off)
    }
    const out = resolveInsideWorkspace(context.directory, args.output)
    await mkdir(path.dirname(out), { recursive: true })
    await writeFile(out, buf)
    const offsets = String(args.qwordOffsets || "0,8,16,24,32,40,48,56,64")
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x.startsWith("0x") ? parseInt(x, 16) : parseInt(x, 10)))
      .filter((x) => Number.isFinite(x))
    const previewLen = Math.max(16, Math.min(args.previewBytes ?? 128, 4096))
    const payload = {
      schema_version: "pwn_payload_artifact.v1",
      output: path.relative(context.directory, out).replace(/\\/g, "/"),
      length: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      preview_hex: buf.subarray(0, previewLen).toString("hex"),
      qwords: qwordViews(buf, offsets),
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_PAYLOAD_ARTIFACT",
      `output: ${payload.output}`,
      `length: ${payload.length}`,
      `sha256: ${payload.sha256}`,
      `preview_hex: ${payload.preview_hex}`,
      "qwords:",
      ...payload.qwords.map((q) => `- +${q.offset}: ${q.qword_le} bytes=${q.hex}`),
    ].join("\n")
  },
})
