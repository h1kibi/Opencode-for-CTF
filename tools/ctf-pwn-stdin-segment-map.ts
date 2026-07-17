import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import crypto from "node:crypto"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

export default tool({
  description:
    "CTF PWN stdin segment visualizer: map payload bytes to sequential read sizes and show leftovers, hashes, and qword previews.",
  args: {
    payloadFile: tool.schema.string().optional().describe("Workspace-relative payload file."),
    payloadHex: tool.schema.string().optional().describe("Payload hex if no file."),
    readSizes: tool.schema.string().describe("Comma/newline read sizes, decimal or 0x hex."),
    delimiterMode: tool.schema
      .string()
      .optional()
      .describe("none | line. line notes newline boundaries but does not alter byte slicing. Default none."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const buf = args.payloadFile
      ? await readFile(resolveInsideWorkspace(context.directory, args.payloadFile))
      : Buffer.from(String(args.payloadHex || "").replace(/[^0-9a-fA-F]/g, ""), "hex")
    const sizes = String(args.readSizes || "")
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x.startsWith("0x") ? parseInt(x, 16) : parseInt(x, 10)))
      .filter((x) => Number.isFinite(x) && x >= 0)
    let off = 0
    const segments = sizes.map((size, idx) => {
      const start = off
      const end = Math.min(buf.length, off + size)
      const s = buf.subarray(start, end)
      off += size
      return {
        index: idx + 1,
        requested: size,
        start,
        end,
        actual: s.length,
        short: s.length < size,
        sha256: crypto.createHash("sha256").update(s).digest("hex"),
        preview_hex: s.subarray(0, 96).toString("hex"),
        newline_offsets:
          args.delimiterMode === "line"
            ? Array.from(s.entries())
                .filter(([, b]) => b === 0x0a)
                .map(([i]) => start + i)
                .slice(0, 20)
            : [],
      }
    })
    const leftover = buf.subarray(Math.min(off, buf.length))
    const payload = {
      schema_version: "pwn_stdin_segment_map.v1",
      payload_length: buf.length,
      payload_sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      read_sizes: sizes,
      segments,
      leftover: {
        start: Math.min(off, buf.length),
        length: leftover.length,
        preview_hex: leftover.subarray(0, 128).toString("hex"),
      },
      coalesce_warning:
        sizes.length > 1
          ? "pipe/file stdin may satisfy multiple read calls from one contiguous payload; socket send boundaries are not read boundaries"
          : "",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "PWN_STDIN_SEGMENT_MAP",
      `payload_length: ${payload.payload_length}`,
      `payload_sha256: ${payload.payload_sha256}`,
      `coalesce_warning: ${payload.coalesce_warning || "none"}`,
      "segments:",
      ...segments.map(
        (s) =>
          `- read#${s.index} requested=${s.requested} range=[${s.start},${s.end}) actual=${s.actual} short=${s.short} sha256=${s.sha256} preview=${s.preview_hex}`,
      ),
      `leftover: start=${payload.leftover.start} length=${payload.leftover.length} preview=${payload.leftover.preview_hex}`,
    ].join("\n")
  },
})
