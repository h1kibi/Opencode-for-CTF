import { tool } from "@opencode-ai/plugin"
import { verifyCandidateFlag } from "../../src/flag-oracle.ts"

/**
 * Executable ECDSA attack family (see docs/PLUGIN-EVALUATION-AND-IMPROVEMENT-PLAN.md §4.13).
 *
 * Implemented attacks (pure mod-n arithmetic, no curve math needed):
 *   - nonce reuse: two signatures (r,s,m) with the SAME k recover
 *     k = (m1 - m2) * (s1 - s2)^-1 mod n, then d = (s1*k - m1) * r1^-1 mod n.
 *   - weak nonce (k known or tiny): k given -> d = (s*k - m) * r^-1 mod n.
 *
 * Every recovered key is verified against BOTH signature equations:
 *   s ≡ k^-1 (m + r*d) mod n   (and r consistent via the second signature).
 * Plaintext/flag strings recovered from m are passed through the shared flag
 * oracle (expectedFlag / flagPattern) for an independent verdict.
 */

type Sig = { r: bigint; s: bigint; m: bigint }

function bits(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length
}

function egcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { g: a, x: 1n, y: 0n }
  const { g, x, y } = egcd(b, a % b)
  return { g, x: y, y: x - (a / b) * y }
}

function invmod(a: bigint, m: bigint): bigint {
  const { g, x } = egcd(((a % m) + m) % m, m)
  if (g !== 1n) throw new Error(`no modular inverse (gcd=${g})`)
  return ((x % m) + m) % m
}

function parseArg(value?: string): bigint | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return BigInt(trimmed)
  } catch {
    return undefined // malformed numeric input → treated as missing
  }
}

function parseSig(n: bigint, r?: string, s?: string, m?: string): Sig | null {
  const rv = parseArg(r)
  const sv = parseArg(s)
  const mv = parseArg(m)
  if (rv === undefined || sv === undefined || mv === undefined) return null
  if (rv <= 0n || rv >= n || sv <= 0n || sv >= n) return null
  return { r: rv, s: sv, m: mv }
}

/** Verify a (k, d) candidate against both signature equations. */
function verifyKeyPair(n: bigint, sigs: Sig[], k: bigint, d: bigint): boolean {
  for (const sig of sigs) {
    const kinv = invmod(((k % n) + n) % n, n)
    const lhs = sig.s % n
    const rhs = (kinv * ((sig.m + sig.r * d) % n)) % n
    if ((((lhs - rhs) % n) + n) % n !== 0n) return false
  }
  return true
}

export default tool({
  description:
    "CTF ECDSA attack runner: recover the nonce k and private key d from two signatures that reused the same k (or a known/tiny k); every recovery is verified against the signature equations, and flag-shaped messages pass through the flag oracle.",
  args: {
    n: tool.schema.string().describe("Curve order n (decimal or 0x hex)."),
    r: tool.schema.string().describe("First signature r."),
    s: tool.schema.string().describe("First signature s."),
    m: tool.schema.string().describe("First message hash m (decimal or 0x)."),
    r2: tool.schema.string().describe("Second signature r (same k => same r)."),
    s2: tool.schema.string().describe("Second signature s."),
    m2: tool.schema.string().describe("Second message hash m2."),
    k: tool.schema.string().optional().describe("Known nonce k (weak-nonce variant) — skips the reuse recovery."),
    expectedFlag: tool.schema
      .string()
      .optional()
      .describe("Exact expected flag; upgrades verification to oracle-verified."),
    flagPattern: tool.schema.string().optional().describe("Constrained regex for the flag format (oracle check)."),
    maxBits: tool.schema.number().optional().describe("Hard cap on curve order bits (default 1024)."),
  },
  async execute(args) {
    const maxBits = args.maxBits ?? 1024
    const n = parseArg(args.n)
    if (n === undefined) return "ERROR: n (curve order) is required"
    if (bits(n) > maxBits) {
      return `ERROR: curve order n is ${bits(n)} bits (cap ${maxBits}); refusing to compute`
    }

    const lines: string[] = []
    const sig1 = parseSig(n, args.r, args.s, args.m)
    if (!sig1) return "ERROR: first signature invalid (r/s/m required, 0 < r,s < n)"

    const knownK = parseArg(args.k)
    let k: bigint | null = null
    let d: bigint | null = null
    let attack = ""

    if (knownK !== undefined) {
      // Weak/known nonce: d = (s*k - m) * r^-1 mod n
      attack = "known-nonce"
      const sig = sig1
      d = (((((sig.s * knownK - sig.m) % n) + n) % n) * invmod(sig.r, n)) % n
      k = knownK
      if (!verifyKeyPair(n, [sig], k, d)) {
        return "ERROR: recovered d does not satisfy the signature equation — check that k/m/r/s use the same hash/order conventions"
      }
      lines.push(`attack: known-nonce (k supplied)`)
    } else {
      // Nonce reuse: needs a second signature.
      const sig2 = parseSig(n, args.r2, args.s2, args.m2)
      if (!sig2) return "ERROR: nonce-reuse attack needs a second signature (r2/s2/m2)"
      if (sig1.r !== sig2.r) {
        lines.push(
          "hint: r1 != r2 — the two signatures did NOT reuse the same k; direct recovery is not possible without lattice methods",
        )
      }
      attack = "nonce-reuse"
      try {
        k = (((((sig1.m - sig2.m) % n) + n) % n) * invmod((((sig1.s - sig2.s) % n) + n) % n, n)) % n
        d = (((((sig1.s * k - sig1.m) % n) + n) % n) * invmod(sig1.r, n)) % n
      } catch (error) {
        return `ERROR: nonce-reuse recovery failed: ${error instanceof Error ? error.message : String(error)}`
      }
      if (!verifyKeyPair(n, [sig1, sig2], k, d)) {
        return "ERROR: recovered (k, d) does not satisfy both signature equations — the signatures likely did not share k"
      }
      lines.push(`attack: nonce-reuse (r1==r2: ${sig1.r === sig2.r})`)
    }

    lines.push(`k: ${k}`)
    lines.push(`d: ${d}`)
    lines.push("verification: mathematically verified against signature equation(s)")

    // Flag oracle: messages are usually hashes, but short/padded plaintext
    // messages occasionally carry the flag directly.
    const messageTexts = [sig1.m.toString()]
    const verification = await verifyCandidateFlag({
      candidates: messageTexts,
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

    lines.push(
      `next: use d to forge signatures (d sign with any k you choose) or decrypt ECIES-derived messages if the challenge uses the same keypair`,
    )
    return lines.join("\n")
  },
})
