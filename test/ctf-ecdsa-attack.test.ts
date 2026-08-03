import { generatePrimeSync } from "node:crypto"
import { describe, expect, it } from "vitest"

type ToolLike = { execute: (args: Record<string, unknown>) => Promise<string> }

async function loadEcdsaTool(): Promise<ToolLike> {
  const mod = await import("../tools/crypto/ctf-ecdsa-attack.ts")
  return mod.default as unknown as ToolLike
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

function sign(n: bigint, d: bigint, k: bigint, r: bigint, m: bigint): bigint {
  return (invmod(k, n) * ((m + r * d) % n)) % n
}

describe("ctf-ecdsa-attack", () => {
  it("recovers k and d from two signatures that reused the same nonce", async () => {
    const tool = await loadEcdsaTool()
    const n = generatePrimeSync(128, { bigint: true })
    const d = 98765n
    const k = 12345n
    const r = 55555n
    const m1 = 111n
    const m2 = 222n
    const s1 = sign(n, d, k, r, m1)
    const s2 = sign(n, d, k, r, m2)

    const out = await tool.execute({
      n: n.toString(),
      r: r.toString(),
      s: s1.toString(),
      m: m1.toString(),
      r2: r.toString(),
      s2: s2.toString(),
      m2: m2.toString(),
    })
    expect(out).toContain("nonce-reuse")
    expect(out).toContain(`k: ${k}`)
    expect(out).toContain(`d: ${d}`)
    expect(out).toContain("mathematically verified")
  })

  it("recovers d from a known nonce k", async () => {
    const tool = await loadEcdsaTool()
    const n = generatePrimeSync(128, { bigint: true })
    const d = 424242n
    const k = 999n
    const r = 777n
    const m = 555n
    const s = sign(n, d, k, r, m)

    const out = await tool.execute({
      n: n.toString(),
      r: r.toString(),
      s: s.toString(),
      m: m.toString(),
      k: k.toString(),
    })
    expect(out).toContain("known-nonce")
    expect(out).toContain(`d: ${d}`)
    expect(out).toContain("mathematically verified")
  })

  it("rejects signatures that did not share k", async () => {
    const tool = await loadEcdsaTool()
    const n = generatePrimeSync(128, { bigint: true })
    const d = 98765n
    const k1 = 12345n
    const k2 = 67890n
    const s1 = sign(n, d, k1, 55555n, 111n)
    const s2 = sign(n, d, k2, 66666n, 222n)

    const out = await tool.execute({
      n: n.toString(),
      r: "55555",
      s: s1.toString(),
      m: "111",
      r2: "66666",
      s2: s2.toString(),
      m2: "222",
    })
    expect(out).toContain("ERROR")
    expect(out).toContain("did not share k")
  })

  it("rejects invalid signatures and oversized curve orders", async () => {
    const tool = await loadEcdsaTool()
    expect(await tool.execute({ n: "17", r: "1", s: "1", m: "x" })).toContain("ERROR")
    expect(await tool.execute({ n: (1n << 2000n).toString(), r: "1", s: "1", m: "1" })).toContain("refusing to compute")
  })
})
