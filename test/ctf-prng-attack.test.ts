import { describe, expect, it } from "vitest"
import { Mt19937, untemper } from "../tools/crypto/ctf-prng-attack.ts"

type ToolLike = { execute: (args: Record<string, unknown>) => Promise<string> }

async function loadTool(): Promise<ToolLike> {
  const mod = await import("../tools/crypto/ctf-prng-attack.ts")
  return mod.default as unknown as ToolLike
}

describe("ctf-prng-attack: mt19937", () => {
  it("clones the state from 624 outputs and predicts the future", async () => {
    const tool = await loadTool()
    const mt = new Mt19937(1337)
    const outputs: number[] = []
    for (let i = 0; i < 624 + 5; i++) outputs.push(mt.nextInt())

    const out = await tool.execute({
      kind: "mt19937",
      outputs: outputs.slice(0, 624).join(" "),
      predict: 5,
      expectedNext: outputs.slice(624).join(","),
    })
    expect(out).toContain("state_cloned: true")
    expect(out).toContain("expected_next: MATCH")
  })

  it("untemper inverts temper exactly", () => {
    const mt = new Mt19937(42)
    const raw = mt.nextInt()
    const state = untemper(raw)
    // Re-temper the recovered state word and compare.
    let y = state
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    expect(y >>> 0).toBe(raw)
  })

  it("rejects too few outputs", async () => {
    const tool = await loadTool()
    const out = await tool.execute({ kind: "mt19937", outputs: "1 2 3" })
    expect(out).toContain("ERROR")
    expect(out).toContain(">= 624")
  })
})

describe("ctf-prng-attack: lcg", () => {
  it("recovers a, c and predicts when m is supplied", async () => {
    const tool = await loadTool()
    const m = 2n ** 32n
    const a = 1664525n
    const c = 1013904223n
    const outputs: bigint[] = []
    let x = 12345n
    for (let i = 0; i < 10; i++) {
      outputs.push(x)
      x = (a * x + c) % m
    }

    const out = await tool.execute({
      kind: "lcg",
      outputs: outputs.slice(0, 8).join(" "),
      m: m.toString(),
      predict: 3,
      expectedNext: [outputs[8], outputs[9]].join(","),
    })
    expect(out).toContain(`a: ${a}`)
    expect(out).toContain(`c: ${c}`)
    expect(out).toContain("expected_next: MATCH")
    expect(out).toContain("all 8 supplied outputs reproduced")
  })

  it("recovers m via difference-gcd when it is unknown", async () => {
    const tool = await loadTool()
    const m = 2n ** 31n - 1n // Mersenne prime modulus
    const a = 1103515245n
    const c = 12345n
    const outputs: bigint[] = []
    let x = 987654321n
    for (let i = 0; i < 8; i++) {
      outputs.push(x)
      x = (a * x + c) % m
    }

    const out = await tool.execute({
      kind: "lcg",
      outputs: outputs.join(" "),
      predict: 2,
    })
    expect(out).toContain("(recovered via difference-gcd)")
    expect(out).toContain(`m: ${m}`)
    expect(out).toContain(`a: ${a}`)
  })

  it("recovers a non-prime power-of-two modulus without it being supplied", async () => {
    const tool = await loadTool()
    const m = 2n ** 32n
    const a = 1103515245n
    const c = 12345n
    const outputs: bigint[] = []
    let x = 987654321n
    for (let i = 0; i < 8; i++) {
      outputs.push(x)
      x = (a * x + c) % m
    }

    const out = await tool.execute({ kind: "lcg", outputs: outputs.join(" ") })
    expect(out).toContain("(recovered via difference-gcd)")
    expect(out).toContain(`m: ${m}`)
    expect(out).toContain(`a: ${a}`)
  })

  it("rejects inconsistent output sequences", async () => {
    const tool = await loadTool()
    const out = await tool.execute({ kind: "lcg", outputs: "1 2 4 8 16 33", m: "100" })
    expect(out).toContain("ERROR")
  })
})
