import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/crypto/ctf-crypto-analyze.ts"

describe("ctf-crypto-analyze tool", () => {
  it("routes RSA-shaped input through the RSA probe", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-crypto-analyze-"))
    const target = path.join(root, "rsa.txt")
    await writeFile(target, "n = 3233\ne = 17\nc = 855\np = 61\nq = 53\n", "utf8")

    const out = await mod.default.execute({ input: "rsa.txt", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.schemaVersion).toBe("crypto_analyze.v1")
    expect(payload.inputKind).toBe("file")
    expect(payload.primitive).toBe("rsa")
    expect(payload.rsaProbe).toContain("public_exponent_hint: e=17")
    expect(payload.rsaProbe).toContain("factor_hint: p/q present")
  })

  it("routes symmetric-looking raw text without invoking RSA probe", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-crypto-analyze-"))
    const text = "AES-CBC ciphertext with iv = 00112233445566778899aabbccddeeff and padding oracle errors"

    const out = await mod.default.execute({ input: text, jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.inputKind).toBe("raw")
    expect(payload.primitive).toBe("symmetric")
    expect(payload.rsaProbe).toBeNull()
    expect(payload.nextToolHint).toContain("mode misuse")
    expect(payload.skipped).toContain("rsa_probe_skipped: route is not RSA-shaped")
  })
})
