import { tool } from "@opencode-ai/plugin"

type WordBits = 32 | 64

type OffsetResult = {
  offset: number
  widthBytes: number
  needle: string
}

function cyclic(length: number) {
  const sets = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789"]
  let out = ""
  outer: for (const a of sets[0])
    for (const b of sets[1])
      for (const c of sets[2]) {
        out += a + b + c
        if (out.length >= length) break outer
      }
  return out.slice(0, length)
}

function normalizeBits(bits: number | undefined): WordBits {
  return bits === 32 ? 32 : 64
}

function normalizeHex(value: string) {
  return value.trim().replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "")
}

function hexToAsciiLittle(hex: string, widthBytes: number) {
  const clean = normalizeHex(hex).padStart(widthBytes * 2, "0")
  const bytes = clean.match(/../g) || []
  return bytes
    .reverse()
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join("")
}

function findOffset(pattern: string, value: string, bitsGuess: WordBits): OffsetResult | null {
  const widths = bitsGuess === 64 ? [8, 4] : [4]
  for (const widthBytes of widths) {
    const needle = hexToAsciiLittle(value, widthBytes)
    const offset = pattern.indexOf(needle)
    if (offset >= 0) return { offset, widthBytes, needle }
  }
  return null
}

function packHint(bits: WordBits) {
  return bits === 64 ? "use p64(addr) / flat() for final overwrite" : "use p32(addr) / flat() for final overwrite"
}

function ipHint(bits: WordBits, found: OffsetResult | null) {
  if (!found) return "control_unproven"
  if (bits === 64 && found.widthBytes === 4) return "partial_rip_match_only"
  return bits === 64 ? "rip_pattern_match" : "eip_pattern_match"
}

export default tool({
  description:
    "CTF pwn offset helper: generate a cyclic pattern and resolve RIP/EIP-style crash values into an overwrite offset.",
  args: {
    length: tool.schema.number().optional().describe("Pattern length. Default 400."),
    bits: tool.schema.number().optional().describe("Target word size: 32 or 64. Default 64."),
    crashValue: tool.schema
      .string()
      .optional()
      .describe("Crash register value such as RIP/EIP in hex form, for example 0x6161616c."),
    endian: tool.schema.string().optional().describe("Endian hint. Only little is supported for lookup. Default little."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const length = Math.max(32, Math.min(args.length ?? 400, 8192))
    const bits = normalizeBits(args.bits)
    const endian = (args.endian || "little").toLowerCase()
    if (endian !== "little") {
      return "BLOCK: only little-endian offset lookup is supported right now."
    }

    const pattern = cyclic(length)
    const crashValue = args.crashValue ? normalizeHex(args.crashValue) : ""
    const found = crashValue ? findOffset(pattern, crashValue, bits) : null
    const payload = {
      schema_version: "pwn_offset.v1",
      bits,
      endian,
      pattern_length: length,
      pattern,
      crash_value: crashValue ? `0x${crashValue}` : "",
      offset: found?.offset ?? null,
      offset_width_bytes: found?.widthBytes ?? null,
      ip_control_judgement: ipHint(bits, found),
      pack_hint: packHint(bits),
      recommended_next_action: found
        ? `use offset ${found.offset} in the exploit skeleton, then confirm with a controlled return target`
        : "feed RIP/EIP crash value from gdb/core output back into ctf-pwn-offset or use ctf-pwn-crash-probe to capture one",
      fallback_action: found
        ? "if the controlled target still fails, re-check newline truncation, argv/stdin mode, and bad-byte effects"
        : "increase pattern length or validate whether the crash came from RIP/EIP rather than a data pointer",
      stop_if: found
        ? "the same payload offset yields inconsistent control across identical runs"
        : "the target never crashes or the observed value is not pattern-derived after two controlled attempts",
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)

    return [
      "PWN_OFFSET",
      `bits: ${payload.bits}`,
      `endian: ${payload.endian}`,
      `pattern_length: ${payload.pattern_length}`,
      `crash_value: ${payload.crash_value || "none"}`,
      `offset: ${payload.offset ?? "unknown"}`,
      `offset_width_bytes: ${payload.offset_width_bytes ?? "unknown"}`,
      `ip_control_judgement: ${payload.ip_control_judgement}`,
      `pack_hint: ${payload.pack_hint}`,
      `recommended_next_action: ${payload.recommended_next_action}`,
      `fallback_action: ${payload.fallback_action}`,
      `stop_if: ${payload.stop_if}`,
      `pattern: ${payload.pattern}`,
    ].join("\n")
  },
})
