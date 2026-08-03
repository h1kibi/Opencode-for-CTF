import { generatePrimeSync } from "node:crypto"
import { describe, expect, it } from "vitest"

type ToolLike = { execute: (args: Record<string, unknown>) => Promise<string> }

async function loadTool(): Promise<ToolLike> {
  const mod = await import("../tools/crypto/ctf-rsa-attack.ts")
  return mod.default as unknown as ToolLike
}

function powmod(base: bigint, exp: bigint, mod: bigint): bigint {
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

function invmod(a: bigint, m: bigint): bigint {
  const egcd = (x: bigint, y: bigint): { g: bigint; a: bigint; b: bigint } => {
    if (y === 0n) return { g: x, a: 1n, b: 0n }
    const { g, a: a1, b: b1 } = egcd(y, x % y)
    return { g, a: b1, b: a1 - (x / y) * b1 }
  }
  const { g, a: coeff } = egcd(((a % m) + m) % m, m)
  if (g !== 1n) throw new Error("no inverse")
  return ((coeff % m) + m) % m
}

function messageToBigInt(text: string): bigint {
  return BigInt(`0x${Buffer.from(text, "utf8").toString("hex")}`)
}

describe("ctf-rsa-attack", () => {
  it("uses directly provided p/q and oracle-verifies the flag", async () => {
    const tool = await loadTool()
    const p = generatePrimeSync(256, { bigint: true })
    const q = generatePrimeSync(256, { bigint: true })
    const n = p * q
    const e = 65537n
    const m = messageToBigInt("flag{rsa-direct}")
    const c = powmod(m, e, n)

    const out = await tool.execute({
      n: n.toString(),
      e: e.toString(),
      c: c.toString(),
      p: p.toString(),
      q: q.toString(),
      expectedFlag: "flag{rsa-direct}",
    })
    expect(out).toContain("factorization: direct p/q")
    expect(out).toContain("flag{rsa-direct}")
    expect(out).toContain("oracle-verified")
    expect(out).toContain("mathematically verified")
  })

  it("factors close primes with Fermat", async () => {
    const tool = await loadTool()
    const p = 1000000007n
    const q = 1000000009n
    const n = p * q
    const e = 65537n
    const m = messageToBigInt("fermat")
    const c = powmod(m, e, n)

    const out = await tool.execute({ n: n.toString(), e: e.toString(), c: c.toString() })
    expect(out).toContain("fermat")
    expect(out).toContain("factored")
    expect(out).toContain("fermat")
  })

  it("recovers a small private exponent with Wiener", async () => {
    const tool = await loadTool()
    const p = generatePrimeSync(128, { bigint: true })
    const q = generatePrimeSync(128, { bigint: true })
    const n = p * q
    const phi = (p - 1n) * (q - 1n)
    const d = 65537n
    const e = invmod(d, phi)
    const m = 424242n
    const c = powmod(m, e, n)

    const out = await tool.execute({ n: n.toString(), e: e.toString(), c: c.toString() })
    expect(out).toContain("wiener")
    expect(out).toContain(`d=${d}`)
  })

  it("recovers plaintext from a common-modulus pair", async () => {
    const tool = await loadTool()
    const p = generatePrimeSync(128, { bigint: true })
    const q = generatePrimeSync(128, { bigint: true })
    const n = p * q
    const m = messageToBigInt("shared-n")
    const e1 = 3n
    const e2 = 5n
    const c1 = powmod(m, e1, n)
    const c2 = powmod(m, e2, n)

    const out = await tool.execute({
      n: n.toString(),
      e: e1.toString(),
      c: c1.toString(),
      n2: n.toString(),
      e2: e2.toString(),
      c2: c2.toString(),
    })
    expect(out).toContain("common_modulus")
    expect(out).toContain("shared-n")
  })

  it("factors a shared prime between two moduli", async () => {
    const tool = await loadTool()
    const shared = generatePrimeSync(128, { bigint: true })
    const q1 = generatePrimeSync(128, { bigint: true })
    const q2 = generatePrimeSync(128, { bigint: true })
    const n1 = shared * q1
    const n2 = shared * q2

    const out = await tool.execute({ n: n1.toString(), e: "65537", n2: n2.toString(), e2: "65537" })
    expect(out).toContain("shared_prime")
    expect(out).toContain(`share factor ${shared}`)
  })

  it("recovers small-e plaintext via exact e-th root", async () => {
    const tool = await loadTool()
    const p = generatePrimeSync(128, { bigint: true })
    const q = generatePrimeSync(128, { bigint: true })
    const n = p * q
    const e = 3n
    const m = 12345n
    const c = m ** e // m^e < n

    const out = await tool.execute({ n: n.toString(), e: e.toString(), c: c.toString() })
    expect(out).toContain("small_e")
    expect(out).toContain("12345")
  })

  it("recovers plaintext via Hastad broadcast (CRT + e-th root)", async () => {
    const tool = await loadTool()
    const e = 3n
    const m = messageToBigInt("has") // printable, and m^e < each 128-bit modulus
    const moduli: bigint[] = []
    for (let i = 0; i < 3; i++) {
      const p = generatePrimeSync(128, { bigint: true })
      const q = generatePrimeSync(128, { bigint: true })
      moduli.push(p * q)
    }
    const c = moduli.map((n) => powmod(m, e, n))

    const out = await tool.execute({
      n: moduli[0].toString(),
      e: e.toString(),
      c: c[0].toString(),
      n2: moduli[1].toString(),
      e2: e.toString(),
      c2: c[1].toString(),
      n3: moduli[2].toString(),
      e3: e.toString(),
      c3: c[2].toString(),
    })
    expect(out).toContain("hastad_broadcast")
    expect(out).toContain("has")
  })

  it("rejects oversized moduli instead of computing", async () => {
    const tool = await loadTool()
    const n = (1n << 9000n) | 1n
    const out = await tool.execute({ n: n.toString(), e: "65537" })
    expect(out).toContain("ERROR")
    expect(out).toContain("refusing to compute")
  })

  it("reports failure honestly when nothing applies", async () => {
    const tool = await loadTool()
    const p = generatePrimeSync(256, { bigint: true })
    const q = generatePrimeSync(256, { bigint: true })
    const n = p * q
    const out = await tool.execute({ n: n.toString(), e: "65537" })
    expect(out).toContain("result: none of")
  })
})
