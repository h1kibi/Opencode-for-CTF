import { tool } from "@opencode-ai/plugin"
import { verifyCandidateFlag } from "../../src/flag-oracle.ts"

/**
 * Executable RSA attack family.
 *
 * Unlike ctf-rsa-probe (which only inventories parameters), this tool runs
 * actual attacks and returns recovered factors / private exponents /
 * plaintexts with a verification verdict:
 *
 *   - `mathematical` — recovered plaintext re-encrypts to the ciphertext
 *     (powmod(m, e, n) === c), an independent oracle for the data at hand;
 *   - `oracle-verified` — plaintext matches the exact expected flag;
 *   - `candidate` — recovered but not independently verified (including
 *     format-only `flagPattern` matches).
 *
 * Implemented attacks: direct p/q, shared prime (GCD), common modulus,
 * small-e / Hastad broadcast (e-th root), Wiener (continued fractions),
 * then pragmatic Fermat factorization. All arithmetic is BigInt — no
 * external deps.
 */

const DEFAULT_MAX_BITS = 8192
const FERMAT_MAX_ITER = 50_000n

// ---------------------------------------------------------------------------
// BigInt arithmetic helpers
// ---------------------------------------------------------------------------

function bits(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
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

function powmod(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n
  let result = 1n
  base = ((base % mod) + mod) % mod
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = (result * base) % mod
    base = (base * base) % mod
    e >>= 1n
  }
  return result
}

function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt of negative")
  if (n < 2n) return n
  let x = 1n << BigInt((bits(n) + 1) >> 1)
  while (true) {
    const y = (x + n / x) >> 1n
    if (y >= x) return x
    x = y
  }
}

function isPerfectSquare(n: bigint): boolean {
  const root = isqrt(n)
  return root * root === n
}

/** Integer k-th root via binary search (exact match or null). */
function iroot(n: bigint, k: bigint): bigint | null {
  if (n < 0n) return null
  if (n < 2n) return n
  let lo = 1n
  let hi = 1n << BigInt(Math.ceil(bits(n) / Number(k)))
  let best = 1n
  while (lo <= hi) {
    const mid = (lo + hi) >> 1n
    const pow = mid ** k
    if (pow === n) return mid
    if (pow < n) {
      best = mid
      lo = mid + 1n
    } else {
      hi = mid - 1n
    }
  }
  return best ** k === n ? best : null
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

type Pair = { n: bigint; e: bigint; c?: bigint }
type Factor = { p: bigint; q: bigint }

function fermatFactor(n: bigint, maxIter = FERMAT_MAX_ITER): Factor | null {
  let a = isqrt(n)
  if (a * a < n) a += 1n
  for (let i = 0n; i < maxIter; i++) {
    const b2 = a * a - n
    const b = isqrt(b2)
    if (b * b === b2) {
      const p = a - b
      const q = a + b
      if (p > 1n && q > 1n && p * q === n) return { p, q }
    }
    a += 1n
  }
  return null
}

function fermatIterationBudget(n: bigint): bigint {
  const nBits = bits(n)
  if (nBits <= 128) return FERMAT_MAX_ITER
  if (nBits <= 256) return 10_000n
  if (nBits <= 1024) return 2_000n
  return 500n
}

function* continuedFraction(num: bigint, den: bigint): Generator<bigint> {
  let a = num
  let b = den
  while (b !== 0n) {
    const q = a / b
    yield q
    ;[a, b] = [b, a - q * b]
  }
}

/** Wiener attack via continued fractions of e/n — recovers small private d. */
function wienerFactor(n: bigint, e: bigint): { p: bigint; q: bigint; d: bigint } | null {
  let h0 = 0n
  let h1 = 1n
  let k0 = 1n
  let k1 = 0n
  for (const quotient of continuedFraction(e, n)) {
    const h2 = quotient * h1 + h0 // convergent numerator (k in the literature)
    const k2 = quotient * k1 + k0 // convergent denominator (d candidate)
    h0 = h1
    h1 = h2
    k0 = k1
    k1 = k2
    const k = h1
    const d = k1
    if (k === 0n || d === 0n) continue
    if ((e * d - 1n) % k !== 0n) continue
    const phi = (e * d - 1n) / k
    const s = n - phi + 1n
    if (s < 0n) continue
    const disc = s * s - 4n * n
    if (disc < 0n || !isPerfectSquare(disc)) continue
    const root = isqrt(disc)
    const p = (s + root) / 2n
    const q = (s - root) / 2n
    if (p > 1n && q > 1n && p * q === n) return { p, q, d }
  }
  return null
}

function crt(residues: bigint[], moduli: bigint[]): bigint {
  let x = 0n
  let m = 1n
  for (let i = 0; i < residues.length; i++) {
    const m2 = m * moduli[i]
    const t = ((residues[i] - x) * invmod(m % moduli[i], moduli[i])) % moduli[i]
    x = (x + m * t) % m2
    m = m2
  }
  return ((x % m) + m) % m
}

/** Decrypt a pair with known factors; returns { m, verified } or null. */
function decryptWithFactors(pair: Pair, p: bigint, q: bigint): { m: bigint; verified: boolean } | null {
  if (pair.n !== p * q) return null
  if (pair.c === undefined) return null
  const phi = (p - 1n) * (q - 1n)
  const d = invmod(pair.e, phi)
  const m = powmod(pair.c, d, pair.n)
  return { m, verified: powmod(m, pair.e, pair.n) === pair.c }
}

/** Best-effort printable-string rendering of a plaintext. */
function plaintextString(m: bigint): string | null {
  try {
    let hex = m.toString(16)
    if (hex.length % 2) hex = `0${hex}`
    const text = Buffer.from(hex, "hex").toString("utf8")
    if ([...text].every((ch) => ch >= " " || ch === "\n" || ch === "\r" || ch === "\t")) return text
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function parseArg(value?: string): bigint | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return BigInt(trimmed) // BigInt accepts "0x..." prefixes natively
}

export default tool({
  description:
    "CTF RSA attack runner: given n/e/c (up to 3 pairs) try direct p/q, shared prime, common modulus, Fermat, small-e/Hastad broadcast, and Wiener; return recovered factors/d/plaintext with a mathematical or flag-oracle verification verdict.",
  args: {
    n: tool.schema.string().optional().describe("First modulus (decimal or 0x hex)."),
    e: tool.schema.string().optional().describe("First public exponent."),
    c: tool.schema.string().optional().describe("First ciphertext (optional; needed for plaintext recovery)."),
    n2: tool.schema.string().optional().describe("Second modulus (shared prime / common modulus / Hastad)."),
    e2: tool.schema.string().optional().describe("Second public exponent."),
    c2: tool.schema.string().optional().describe("Second ciphertext."),
    n3: tool.schema.string().optional().describe("Third modulus (Hastad broadcast)."),
    e3: tool.schema.string().optional().describe("Third public exponent."),
    c3: tool.schema.string().optional().describe("Third ciphertext."),
    p: tool.schema.string().optional().describe("Known factor p (skips factorization)."),
    q: tool.schema.string().optional().describe("Known factor q (skips factorization)."),
    maxBits: tool.schema
      .number()
      .optional()
      .describe("Hard cap on modulus size in bits (default 8192). Protects against pathological inputs."),
    expectedFlag: tool.schema
      .string()
      .optional()
      .describe("Exact expected flag; upgrades verification to oracle-verified."),
    flagPattern: tool.schema
      .string()
      .optional()
      .describe("Constrained regex for the flag format; matches stay candidate-only."),
  },
  async execute(args) {
    const maxBits = args.maxBits ?? DEFAULT_MAX_BITS
    const pairs: Pair[] = []
    for (const [nKey, eKey, cKey] of [
      ["n", "e", "c"],
      ["n2", "e2", "c2"],
      ["n3", "e3", "c3"],
    ] as const) {
      const n = parseArg(args[nKey])
      const e = parseArg(args[eKey])
      if (!n || !e) continue
      if (bits(n) > maxBits) {
        return `ERROR: modulus ${nKey} is ${bits(n)} bits (cap ${maxBits}); refusing to compute`
      }
      pairs.push({ n, e, c: parseArg(args[cKey]) })
    }
    if (pairs.length === 0) return "ERROR: at least one (n, e) pair is required"

    const lines: string[] = []
    const attackResults: string[] = []
    const plaintexts: Array<{ pairIndex: number; text: string }> = []
    const knownP = parseArg(args.p)
    const knownQ = parseArg(args.q)
    /** Moduli already factored — skip duplicate attacks. */
    const factoredModuli = new Set<bigint>()
    /** Pair indexes whose plaintext has already been recovered by a cheaper attack. */
    const solvedPairs = new Set<number>()

    const recordPlaintext = (pairIndex: number, m: bigint, verified: boolean) => {
      const text = plaintextString(m)
      if (text !== null) {
        plaintexts.push({ pairIndex, text })
        lines.push(
          `plaintext_${pairIndex + 1}: ${JSON.stringify(text)} (dec=${m})` +
            (verified ? " (mathematically verified: m^e mod n == c)" : " (not re-encryption-verified)"),
        )
      } else {
        lines.push(`plaintext_${pairIndex + 1}_hex: 0x${m.toString(16)}` + (verified ? " (verified)" : ""))
      }
    }

    // 1) Direct p/q
    if (knownP && knownQ) {
      const pair = pairs[0]
      if (knownP * knownQ === pair.n) {
        const dec = decryptWithFactors(pair, knownP, knownQ)
        lines.push(`factorization: direct p/q (p=${knownP}, q=${knownQ})`)
        attackResults.push("direct=factored(n1)")
        factoredModuli.add(pair.n)
        if (dec) {
          recordPlaintext(0, dec.m, dec.verified)
          solvedPairs.add(0)
        }
      } else {
        lines.push(`factorization: given p*q != n — p/q ignored`)
        attackResults.push("direct=mismatch")
      }
    }
    // 2) Shared prime (GCD over all pairs)
    const ns = pairs.map((pair) => pair.n)

    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const g = gcd(ns[i], ns[j])
        if (g > 1n && g < ns[i] && g < ns[j]) {
          const p = g
          const q = ns[i] / g
          if (p * q === ns[i]) {
            lines.push(`shared_prime: n${i + 1}/n${j + 1} share factor ${p}`)
            attackResults.push(`shared_prime=factored(n${i + 1})`)
            factoredModuli.add(ns[i])
            const dec = decryptWithFactors(pairs[i], p, q)
            if (dec) {
              recordPlaintext(i, dec.m, dec.verified)
              solvedPairs.add(i)
            }
          }
        }
      }
    }

    // 3) Common modulus (same n, coprime exponents)
    if (pairs.length >= 2 && pairs[0].n === pairs[1].n && pairs[0].e !== pairs[1].e) {
      const [a, b] = [pairs[0], pairs[1]]
      if (a.c !== undefined && b.c !== undefined) {
        const { g, x, y } = egcd(a.e, b.e)
        if (g === 1n) {
          try {
            const m =
              x < 0n
                ? (powmod(invmod(a.c, a.n), -x, a.n) * powmod(b.c, y, a.n)) % a.n
                : (powmod(a.c, x, a.n) * powmod(invmod(b.c, a.n), -y, a.n)) % a.n
            const verified = powmod(m, a.e, a.n) === a.c && powmod(m, b.e, a.n) === b.c
            lines.push("common_modulus: recovered plaintext via gcd(e1,e2)=1")
            attackResults.push("common_modulus=recovered")
            recordPlaintext(0, m, verified)
            solvedPairs.add(0)
            solvedPairs.add(1)
          } catch {
            attackResults.push("common_modulus=failed")
          }
        }
      }
    }

    // 4) Small exponent: m^e < n -> exact e-th root
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]
      if (solvedPairs.has(i) || pair.c === undefined || pair.e < 2n || pair.e > 17n) continue
      const root = iroot(pair.c, pair.e)
      if (root !== null && powmod(root, pair.e, pair.n) === pair.c) {
        lines.push(`small_e: n${i + 1} plaintext is the exact e-th root of c`)
        attackResults.push(`small_e=recovered(n${i + 1})`)
        recordPlaintext(i, root, true)
        solvedPairs.add(i)
      }
    }

    // 5) Hastad broadcast: 3 pairs with the same small e
    if (pairs.length === 3 && pairs[0].e === pairs[1].e && pairs[1].e === pairs[2].e) {
      const e = pairs[0].e
      if (e >= 3n && e <= 17n && pairs.every((pair) => pair.c !== undefined)) {
        const combined = crt(
          pairs.map((pair) => pair.c as bigint),
          ns,
        )
        const root = iroot(combined, e)
        // NOTE: use exact equality, not powmod(root, e, combined) — the
        // modulus here IS m^e, so powmod would return 0 (x mod x).
        if (root !== null && root ** e === combined) {
          lines.push(`hastad_broadcast: e=${e} plaintext recovered via CRT + e-th root`)
          attackResults.push("hastad=recovered")
          recordPlaintext(0, root, true)
          solvedPairs.add(0)
          solvedPairs.add(1)
          solvedPairs.add(2)
        } else {
          attackResults.push("hastad=failed")
        }
      }
    }

    // 6) Wiener (small private d)
    for (let i = 0; i < pairs.length; i++) {
      if (solvedPairs.has(i) || factoredModuli.has(pairs[i].n)) continue
      const result = wienerFactor(pairs[i].n, pairs[i].e)
      if (result) {
        lines.push(`wiener: n${i + 1} factored, d=${result.d}`)
        attackResults.push(`wiener=factored(n${i + 1})`)
        factoredModuli.add(pairs[i].n)
        const dec = decryptWithFactors(pairs[i], result.p, result.q)
        if (dec) {
          recordPlaintext(i, dec.m, dec.verified)
          solvedPairs.add(i)
        }
      }
    }

    // 7) Fermat (close primes). Run last with an adaptive budget because it is
    // much more expensive than the direct/common-modulus/small-e/Wiener lanes.
    for (let i = 0; i < pairs.length; i++) {
      if (solvedPairs.has(i) || factoredModuli.has(pairs[i].n)) continue
      const factors = fermatFactor(pairs[i].n, fermatIterationBudget(pairs[i].n))
      if (factors) {
        lines.push(`fermat: n${i + 1} factored (p=${factors.p}, q=${factors.q})`)
        attackResults.push(`fermat=factored(n${i + 1})`)
        factoredModuli.add(pairs[i].n)
        const dec = decryptWithFactors(pairs[i], factors.p, factors.q)
        if (dec) {
          recordPlaintext(i, dec.m, dec.verified)
          solvedPairs.add(i)
        }
      }
    }

    if (attackResults.length === 0) {
      lines.push("result: none of {direct, shared_prime, common_modulus, small_e, hastad, wiener, fermat} succeeded")
      lines.push("next: check parameter hygiene (e=65537 with proper padding resists all of the above);")
      lines.push("      consider Coppersmith (partial p/q, small d bits) or side-channel leaks (dp/dq)")
    } else {
      lines.push(`attacks: ${attackResults.join(", ")}`)
    }

    // 8) Flag oracle verification of recovered plaintexts.
    if (plaintexts.length > 0) {
      const verification = await verifyCandidateFlag({
        candidates: plaintexts.map((entry) => entry.text),
        expectedFlag: args.expectedFlag,
        flagPattern: args.flagPattern,
      })
      if (verification.status === "oracle-verified" && verification.matchedFlag) {
        lines.push(`flag_verification: oracle-verified (${JSON.stringify(verification.matchedFlag)})`)
      } else if (verification.status === "rejected") {
        lines.push(`flag_verification: rejected by oracle (${verification.reason})`)
      } else {
        lines.push(
          `flag_verification: candidate only (${verification.reason}) — expectedFlag can promote to oracle-verified; flagPattern only narrows format`,
        )
      }
    }

    return lines.join("\n")
  },
})
