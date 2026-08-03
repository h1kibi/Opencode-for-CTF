import { describe, expect, it } from "vitest"

type ToolLike = { execute: (args: Record<string, unknown>) => Promise<string> }

async function loadTool(): Promise<ToolLike> {
  const mod = await import("../tools/misc/ctf-encoding-chain.ts")
  return mod.default as unknown as ToolLike
}

function rot13(text: string): string {
  return text.replace(/[A-Za-z]/g, (ch) => {
    const code = ch.charCodeAt(0)
    const base = code < 97 ? 65 : 97
    return String.fromCharCode(((code - base + 13) % 26) + base)
  })
}

describe("ctf-encoding-chain", () => {
  it("unrolls a base64 -> hex -> rot13 chain and oracle-verifies the flag", async () => {
    const tool = await loadTool()
    const plaintext = "flag{enc}"
    const chain = Buffer.from(Buffer.from(rot13(plaintext), "utf8").toString("hex"), "utf8").toString("base64")

    const out = await tool.execute({ input: chain, expectedFlag: plaintext })
    expect(out).toContain("chain_depth: 3")
    expect(out).toContain("[base64]")
    expect(out).toContain("[hex]")
    expect(out).toContain("[rot13]")
    expect(out).toContain("flag{enc}")
    expect(out).toContain("oracle-verified")
  })

  it("accepts unpadded and whitespace-separated base64", async () => {
    const tool = await loadTool()
    const encoded = Buffer.from("plain-text", "utf8").toString("base64").replace(/=+$/, "")
    const wrapped = encoded.slice(0, 4) + "\n" + encoded.slice(4)
    const out = await tool.execute({ input: wrapped })
    expect(out).toContain("[base64]")
    expect(out).toContain('"plain-text"')
  })

  it("decodes binary and base32 layers", async () => {
    const tool = await loadTool()
    const binary = "01001000 01101001"
    const out1 = await tool.execute({ input: binary })
    expect(out1).toContain("[binary]")
    expect(out1).toContain('"Hi"')

    // RFC 4648 test vector: base32("foobar") === "MZXW6YTBOI======"
    const out2 = await tool.execute({ input: "MZXW6YTBOI======" })
    expect(out2).toContain("[base32]")
    expect(out2).toContain('"foobar"')
  })

  it("passes an already-plain flag through with oracle verification", async () => {
    const tool = await loadTool()
    const out = await tool.execute({ input: "flag{plain}", expectedFlag: "flag{plain}" })
    expect(out).toContain("oracle-verified")
    expect(out).toContain("no recognized encoding chain")
  })

  it("reports no chain for garbage input", async () => {
    const tool = await loadTool()
    const out = await tool.execute({ input: "zzz!!!not an encoding at all" })
    expect(out).toContain("no recognized encoding chain")
  })

  it("respects the depth cap", async () => {
    const tool = await loadTool()
    // base64(hex(binary("11110000"))) — a short chain; depth 1 should truncate it.
    const inner = [...Buffer.from([0b11110000])].map((b) => b.toString(2).padStart(8, "0")).join("")
    const chain = Buffer.from(Buffer.from(inner, "utf8").toString("hex"), "utf8").toString("base64")
    const out = await tool.execute({ input: chain, maxDepth: 1 })
    expect(out).toContain("chain_depth: 1")
  })
})
