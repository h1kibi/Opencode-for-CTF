import { tool } from "@opencode-ai/plugin"
import { verifyCandidateFlag } from "../../src/flag-oracle.ts"
import { DEFAULT_FLAG_PATTERN } from "../../packages/ctf-core/src/flag-rules.ts"

/**
 * Misc: auto-detect and unroll encoding chains.
 *
 * Given a blob like `ZmxhZ3tiYXNlNjR9` the tool tries every decoder in order,
 * keeps only decodings that round-trip (re-encode(decoded) === input), and
 * chains until no decoder applies, a flag shape appears, or the depth cap is
 * hit. Every layer is reported so the agent can see the chain, not just the
 * final answer.
 */

const MAX_CHAIN_DEPTH = 30

/** Non-global flag-like matcher (avoids lastIndex statefulness of global regexes). */
const FLAG_LIKE = new RegExp(`^${DEFAULT_FLAG_PATTERN}$`, "i")

type Decoder = {
  id: string
  decode: (input: string) => string | null
  /** Round-trip check: re-encoding the decoded value must reproduce input. */
  matches: (input: string, decoded: string) => boolean
}

function printableRatio(text: string): number {
  if (!text.length) return 0
  let printable = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 32 && code < 127) printable++
    else if (ch === "\n" || ch === "\r" || ch === "\t") printable++
  }
  return printable / text.length
}

// ---------------------------------------------------------------------------
// RFC 4648 base32 (Node's Buffer has no base32 codec)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Decode(input: string): string | null {
  const trimmed = input.trim().replace(/=+$/, "").toUpperCase()
  if (!/^[A-Z2-7]+$/.test(trimmed)) return null
  let bits = ""
  for (const ch of trimmed) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) return null
    bits += idx.toString(2).padStart(5, "0")
  }
  const byteCount = Math.floor((trimmed.length * 5) / 8)
  const bytes: number[] = []
  for (let i = 0; i < byteCount; i++) {
    bytes.push(parseInt(bits.slice(i * 8, i * 8 + 8), 2))
  }
  const text = Buffer.from(bytes).toString("utf8")
  return text.includes("\uFFFD") ? null : text
}

function base32Encode(text: string): string {
  let bits = ""
  for (const byte of Buffer.from(text, "utf8")) bits += byte.toString(2).padStart(8, "0")
  let out = ""
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)]
  }
  return out.padEnd(Math.ceil(out.length / 8) * 8, "=")
}

function normalizeBase64(input: string) {
  const compact = input.trim().replace(/\s+/g, "")
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null
  const unpadded = compact.replace(/=+$/, "")
  if (unpadded.length % 4 === 1) return null
  return {
    compact,
    unpadded,
    padded: unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "="),
  }
}

const DECODERS: Decoder[] = [
  {
    id: "base64",
    decode(input) {
      try {
        const normalized = normalizeBase64(input)
        if (!normalized) return null
        const text = Buffer.from(normalized.padded, "base64").toString("utf8")
        return text.includes("\uFFFD") ? null : text
      } catch {
        return null
      }
    },
    matches(input, decoded) {
      const normalized = normalizeBase64(input)
      if (!normalized) return false
      return Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "") === normalized.unpadded
    },
  },
  {
    id: "base32",
    decode(input) {
      return base32Decode(input)
    },
    matches(input, decoded) {
      return base32Encode(decoded) === input.trim().toUpperCase()
    },
  },
  {
    id: "hex",
    decode(input) {
      const hex = input.trim()
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null
      const text = Buffer.from(hex, "hex").toString("utf8")
      return text.includes("\uFFFD") ? null : text
    },
    matches(input, decoded) {
      return Buffer.from(decoded, "utf8").toString("hex") === input.trim().toLowerCase()
    },
  },
  {
    id: "binary",
    decode(input) {
      const bits = input.trim().replace(/\s+/g, "")
      if (!/^[01]+$/.test(bits) || bits.length % 8 !== 0) return null
      const bytes: number[] = []
      for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
      const text = Buffer.from(bytes).toString("utf8")
      return text.includes("\uFFFD") ? null : text
    },
    matches(input, decoded) {
      return (
        [...Buffer.from(decoded, "utf8")].map((b) => b.toString(2).padStart(8, "0")).join("") ===
        input.trim().replace(/\s+/g, "")
      )
    },
  },
  {
    id: "url",
    decode(input) {
      try {
        if (!/%[0-9A-Fa-f]{2}/.test(input)) return null
        const text = decodeURIComponent(input)
        return text.includes("\uFFFD") ? null : text
      } catch {
        return null
      }
    },
    matches(input, decoded) {
      try {
        return encodeURIComponent(decoded) === input
      } catch {
        return false
      }
    },
  },
  {
    id: "rot13",
    decode(input) {
      if (!/[A-Za-z]/.test(input)) return null
      return input.replace(/[A-Za-z]/g, (ch) => {
        const code = ch.charCodeAt(0)
        const base = code < 97 ? 65 : 97
        return String.fromCharCode(((code - base + 13) % 26) + base)
      })
    },
    matches(input, decoded) {
      return decoded !== input && rot13LeadsTowardFlag(input, decoded)
    },
  },
  {
    id: "rot47",
    decode(input) {
      if (!/[\x21-\x7E]/.test(input)) return null
      return input.replace(/[\x21-\x7E]/g, (ch) => {
        const code = ch.charCodeAt(0)
        return String.fromCharCode(33 + ((code - 33 + 47) % 94))
      })
    },
    matches(input, decoded) {
      return decoded !== input && rot13LeadsTowardFlag(input, decoded)
    },
  },
]

/**
 * rot13/rot47 are involutions — they always "round-trip", so applying them
 * blindly bounces forever. Apply them only when the decoded text plausibly
 * leads TOWARD a flag: either it contains a flag keyword, or it turns a
 * non-flag-shaped blob into a flag-shaped one. A plaintext `flag{...}` input
 * is left alone (decoding it would move AWAY from the flag).
 */
function rot13LeadsTowardFlag(input: string, decoded: string, expectedFlag?: string): boolean {
  if (expectedFlag?.trim() && decoded === expectedFlag.trim()) return true
  const inputFlagShaped = FLAG_LIKE.test(input)
  const decodedFlagShaped = FLAG_LIKE.test(decoded)
  if (decodedFlagShaped && !inputFlagShaped) return true
  if (decodedFlagShaped && /\b(flag|ctf|key|secret|pctf|actf|dctf|tjctf)\b/i.test(decoded)) return true
  return false
}

export default tool({
  description:
    "CTF misc encoding-chain decoder: auto-detect and unroll stacked encodings (base64/base32/hex/binary/url/rot13/rot47) with round-trip verification per layer; stops at a flag shape or when no decoder applies. Returns the full chain.",
  args: {
    input: tool.schema.string().describe("Encoded blob to decode."),
    maxDepth: tool.schema.number().optional().describe("Max chain depth (default 30)."),
    expectedFlag: tool.schema
      .string()
      .optional()
      .describe("Exact expected flag; upgrades verification to oracle-verified."),
    flagPattern: tool.schema.string().optional().describe("Constrained regex for the flag format (oracle check)."),
  },
  async execute(args) {
    const maxDepth = Math.min(100, Math.max(1, args.maxDepth ?? MAX_CHAIN_DEPTH))
    let current = args.input
    const layers: string[] = []
    const seen = new Set<string>([args.input])
    let terminalReason = ""

    for (let depth = 0; depth < maxDepth; depth++) {
      let applied = false
      for (const decoder of DECODERS) {
        const decoded = decoder.decode(current)
        if (decoded === null || decoded === current) continue
        if (printableRatio(decoded) < 0.9) continue
        const roundTrips =
          decoder.id === "rot13" && args.expectedFlag?.trim() === decoded ? true : decoder.matches(current, decoded)
        if (!roundTrips) continue
        if (seen.has(decoded)) continue // cycle guard (involution decoders)

        layers.push(`[${decoder.id}] ${JSON.stringify(current)} -> ${JSON.stringify(decoded)}`)
        seen.add(decoded)
        current = decoded
        applied = true
        break
      }

      if (!applied) {
        // Flag-shape stop runs only AFTER all decoders failed, so a
        // rot13-lookalike like `synt{...}` still gets decoded toward `flag{...}`.
        terminalReason = FLAG_LIKE.test(current) ? "flag-shaped string reached" : "no decoder round-trips"
        break
      }
    }

    const lines: string[] = []
    if (layers.length === 0) {
      lines.push("result: no recognized encoding chain (or input is already plaintext)")
    } else {
      lines.push(`chain_depth: ${layers.length}`)
      lines.push(...layers)
      lines.push(`final: ${JSON.stringify(current)}`)
      lines.push(`terminal_reason: ${terminalReason}`)
    }

    const verification = await verifyCandidateFlag({
      candidates: [current],
      expectedFlag: args.expectedFlag,
      flagPattern: args.flagPattern,
    })
    if (verification.status === "oracle-verified" && verification.matchedFlag) {
      lines.push(`flag_verification: oracle-verified (${JSON.stringify(verification.matchedFlag)})`)
    } else if (verification.status === "rejected") {
      lines.push(`flag_verification: rejected by oracle (${verification.reason})`)
    } else if (args.expectedFlag || args.flagPattern) {
      lines.push(`flag_verification: candidate only (${verification.reason})`)
    }

    return lines.join("\n")
  },
})
