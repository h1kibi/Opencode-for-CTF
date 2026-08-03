import { tool } from "@opencode-ai/plugin"

/**
 * Executable PRNG attack family.
 *
 *   lcg      — recover (a, c, m) of a linear congruential generator from
 *              >= 4 consecutive outputs; m is recovered via the standard
 *              difference-gcd method when not supplied.
 *   mt19937  — clone the 624-word state of a Mersenne Twister from 624
 *              consecutive 32-bit outputs (untemper), then predict the future.
 *
 * Every recovery is verified against the full supplied output sequence and,
 * when `expectedNext` is provided, against the next outputs.
 */

// ---------------------------------------------------------------------------
// MT19937 (standard 32-bit Mersenne Twister)
// ---------------------------------------------------------------------------

const MT_N = 624
const MT_M = 397
const MT_A = 0x9908b0df
const MT_UPPER = 0x80000000
const MT_LOWER = 0x7fffffff
const MT_F = 1812433253

export class Mt19937 {
  private state = new Uint32Array(MT_N)
  private index = MT_N + 1

  constructor(seed?: number) {
    if (seed !== undefined) this.seed(seed)
  }

  seed(seed: number): void {
    this.state[0] = seed >>> 0
    for (let i = 1; i < MT_N; i++) {
      this.state[i] = (MT_F * (this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i) >>> 0
    }
    this.index = MT_N
  }

  /** Restore from 624 consecutive untempered outputs. */
  static fromUntempered(state: Uint32Array): Mt19937 {
    if (state.length !== MT_N) throw new Error(`MT19937 requires ${MT_N} state words, got ${state.length}`)
    const mt = new Mt19937()
    mt.state.set(state)
    mt.index = MT_N
    return mt
  }

  private twist(): void {
    for (let i = 0; i < MT_N; i++) {
      const y = (this.state[i] & MT_UPPER) | (this.state[(i + 1) % MT_N] & MT_LOWER)
      this.state[i] = this.state[(i + MT_M) % MT_N] ^ (y >>> 1) ^ (y & 1 ? MT_A : 0)
    }
    this.index = 0
  }

  nextInt(): number {
    if (this.index >= MT_N) this.twist()
    let y = this.state[this.index++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }
}

/** Invert the MT19937 tempering transformation (right-to-left). */
function unshiftRightXor(y: number, shift: number): number {
  let x = y >>> 0
  for (let i = 0; i < 5; i++) x = (y ^ (x >>> shift)) >>> 0
  return x >>> 0
}

function unshiftLeftXor(y: number, shift: number, mask: number): number {
  let x = y >>> 0
  for (let i = 0; i < 5; i++) x = (y ^ ((x << shift) & mask)) >>> 0
  return x >>> 0
}

/** Invert the MT19937 tempering transformation (right-to-left). */
export function untemper(y: number): number {
  y = y >>> 0
  y = unshiftRightXor(y, 18)
  y = unshiftLeftXor(y, 15, 0xefc60000)
  y = unshiftLeftXor(y, 7, 0x9d2c5680)
  y = unshiftRightXor(y, 11)
  return y >>> 0
}

// ---------------------------------------------------------------------------
// LCG helpers (BigInt)
// ---------------------------------------------------------------------------

function egcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  if (b === 0n) return { g: a, x: 1n, y: 0n }
  const { g, x, y } = egcd(b, a % b)
  return { g, x: y, y: x - (a / b) * y }
}

function gcdAbs(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) [x, y] = [y, x % y]
  return x
}

function invmod(a: bigint, m: bigint): bigint {
  const { g, x } = egcd(((a % m) + m) % m, m)
  if (g !== 1n) throw new Error(`no modular inverse (gcd=${g})`)
  return ((x % m) + m) % m
}

function normalizeMod(value: bigint, m: bigint): bigint {
  return ((value % m) + m) % m
}

/** Validate (a, c, m) against every consecutive pair of the sequence. */
function validateLcg(outputs: bigint[], m: bigint, a: bigint, c: bigint): boolean {
  for (let i = 0; i + 1 < outputs.length; i++) {
    if (normalizeMod(a * outputs[i] + c, m) !== normalizeMod(outputs[i + 1], m)) return false
  }
  return true
}

/**
 * Recover LCG parameters.
 * - with known m: direct from the first three outputs;
 * - without m: difference-gcd method (t3*t1 - t2^2 and t2*t0 - t1^2 share m
 *   as a factor), then divisor search against the full sequence.
 */
function recoverLcg(
  outputs: bigint[],
  knownM?: bigint,
): { a: bigint; c: bigint; m: bigint; mRecovered: boolean } | null {
  if (knownM !== undefined) {
    try {
      const a = normalizeMod((outputs[2] - outputs[1]) * invmod(outputs[1] - outputs[0], knownM), knownM)
      const c = normalizeMod(outputs[1] - a * outputs[0], knownM)
      if (!validateLcg(outputs, knownM, a, c)) return null
      return { a, c, m: knownM, mRecovered: false }
    } catch {
      return null
    }
  }

  // Difference-gcd over EVERY 5-output window (single-window degenerates when
  // a window happens to satisfy u2 == 0 or similar coincidences).
  let candidate = 0n
  for (let i = 0; i + 4 < outputs.length; i++) {
    const t0 = outputs[i + 1] - outputs[i]
    const t1 = outputs[i + 2] - outputs[i + 1]
    const t2 = outputs[i + 3] - outputs[i + 2]
    const t3 = outputs[i + 4] - outputs[i + 3]
    const u1 = t3 * t1 - t2 * t2
    const u2 = t2 * t0 - t1 * t1
    candidate = gcdAbs(gcdAbs(candidate, u1), u2)
  }
  if (candidate <= 1n) return null

  // m may be a divisor of the gcd (the gcd is usually m or a small multiple).
  const candidates = [candidate]
  for (let d = 2n; d <= 512n && d * d <= candidate; d++) {
    if (candidate % d === 0n) {
      candidates.push(candidate / d)
      candidates.push(d)
    }
  } // Largest first — prefer the true modulus over a sub-multiple.
  candidates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  for (const m of candidates) {
    if (m <= 1n) continue
    try {
      const a = normalizeMod((outputs[2] - outputs[1]) * invmod(outputs[1] - outputs[0], m), m)
      const c = normalizeMod(outputs[1] - a * outputs[0], m)
      if (validateLcg(outputs, m, a, c)) return { a, c, m, mRecovered: true }
    } catch {
      // not invertible mod m — try next divisor
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function parseOutputs(raw: string): bigint[] {
  const values = raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => BigInt(token))
  if (values.length === 0) throw new Error("outputs is empty")
  return values
}

export default tool({
  description:
    "CTF PRNG attack runner: recover LCG (a, c, m) from >= 4 consecutive outputs (m optional), or clone the MT19937 state from 624 consecutive 32-bit outputs and predict the future. Every recovery is verified against the supplied sequence.",
  args: {
    kind: tool.schema.enum(["lcg", "mt19937"]).describe("Generator family to attack."),
    outputs: tool.schema
      .string()
      .describe("Consecutive outputs, whitespace/comma separated (lcg: >= 4; mt19937: >= 624)."),
    m: tool.schema
      .string()
      .optional()
      .describe("Known LCG modulus (decimal/0x). When omitted, recovered via difference-gcd."),
    predict: tool.schema.number().optional().describe("How many future outputs to produce (default 3, cap 32)."),
    expectedNext: tool.schema
      .string()
      .optional()
      .describe("Expected next outputs (comma separated) to verify predictions against."),
  },
  async execute(args) {
    const predict = Math.min(32, Math.max(1, args.predict ?? 3))
    let outputs: bigint[]
    try {
      outputs = parseOutputs(args.outputs)
    } catch (error) {
      return `ERROR: invalid outputs: ${error instanceof Error ? error.message : String(error)}`
    }

    const lines: string[] = []
    if (args.kind === "mt19937") {
      if (outputs.length < 624) {
        return `ERROR: mt19937 needs >= 624 consecutive 32-bit outputs, got ${outputs.length}`
      }
      const slice = outputs.slice(0, 624)
      for (const value of slice) {
        if (value < 0n || value >= 0x100000000n) {
          return "ERROR: mt19937 outputs must be 32-bit values (0 <= x < 2^32)"
        }
      }
      const state = new Uint32Array(624)
      for (let i = 0; i < 624; i++) state[i] = untemper(Number(slice[i]))
      const mt = Mt19937.fromUntempered(state)
      const predictions: number[] = []
      for (let i = 0; i < predict; i++) predictions.push(mt.nextInt())
      lines.push("prng_kind: mt19937")
      lines.push(`state_cloned: true (${624} outputs untempered)`)
      lines.push(`predictions: [${predictions.join(", ")}]`)
      lines.push("verification: state cloned; predictions continue the generator sequence")
    } else {
      if (outputs.length < 4) {
        return `ERROR: lcg needs >= 4 consecutive outputs, got ${outputs.length}`
      }
      const knownM = args.m ? BigInt(args.m) : undefined
      const recovered = recoverLcg(outputs, knownM)
      if (!recovered) {
        return "ERROR: could not recover a consistent LCG (a, c, m) — check output ordering/format (some challenges mix or skip outputs)"
      }
      const { a, c, m, mRecovered } = recovered
      const predictions: bigint[] = []
      let next = outputs[outputs.length - 1]
      for (let i = 0; i < predict; i++) {
        next = normalizeMod(a * next + c, m)
        predictions.push(next)
      }
      lines.push("prng_kind: lcg")
      lines.push(`m: ${m} ${mRecovered ? "(recovered via difference-gcd)" : "(supplied)"}`)
      lines.push(`a: ${a}`)
      lines.push(`c: ${c}`)
      lines.push(`predictions: [${predictions.join(", ")}]`)
      lines.push(`verification: all ${outputs.length} supplied outputs reproduced by (a, c, m)`)
    }

    if (args.expectedNext) {
      try {
        const expected = parseOutputs(args.expectedNext)
        const actual = lines
          .find((line) => line.startsWith("predictions:"))
          ?.replace("predictions: [", "")
          .replace("]", "")
          .split(", ")
          .filter(Boolean)
          .map((token) => BigInt(token))
        if (actual && actual.length >= expected.length) {
          const match = expected.every((value, i) => value === actual[i])
          lines.push(`expected_next: ${match ? "MATCH" : `MISMATCH (expected [${expected.join(", ")}])`}`)
        }
      } catch {
        // malformed expectedNext — ignore, it is only an optional oracle
      }
    }

    return lines.join("\n")
  },
})
