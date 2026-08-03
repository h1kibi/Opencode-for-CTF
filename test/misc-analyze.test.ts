import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

const MOD_PATH = "../tools/misc/ctf-misc-analyze.ts"

describe("ctf-misc-analyze tool", () => {
  it("normalizes RSA-like triage to the crypto facade", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-"))
    await writeFile(path.join(root, "params.txt"), "n = 3233\ne = 17\nc = 855\n", "utf8")

    const out = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.schemaVersion).toBe("misc_analyze.v2")
    expect(payload.triage.verdict).toBe("rsa")
    expect(payload.owner).toBe("ctf-crypto")
    expect(payload.handoff).toBe("yes")
    expect(payload.nextTool).toBe("ctf-crypto-analyze")
    expect(payload.nextTarget).toBe("params.txt")
  })

  it("routes crypto-like text into the reachable encoding-chain tool with an input contract", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-"))
    const encoded = Buffer.from("flag{layered}", "utf8").toString("base64")
    await writeFile(path.join(root, "encoded.txt"), encoded, "utf8")

    const out = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.triage.verdict).toBe("crypto_or_encoding")
    expect(payload.shape).toBe("layered_encoding")
    expect(payload.owner).toBe("ctf-misc")
    expect(payload.handoff).toBe("no")
    expect(payload.nextTool).toBe("ctf-encoding-chain")
    expect(payload.inputSource).toEqual({ kind: "file_content", value: "encoded.txt" })
    expect(payload.nextArgsHint).toContain("text content")
  })

  it("detects unpadded base64 but does not misroute a digest as an encoding blob", async () => {
    const mod = await import(MOD_PATH)
    const encodedRoot = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-base64-"))
    const encoded = Buffer.from("plain-text", "utf8").toString("base64").replace(/=+$/, "")
    await writeFile(path.join(encodedRoot, "encoded.txt"), encoded, "utf8")

    const encodedOut = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: encodedRoot } as never)
    const encodedPayload = JSON.parse(String(encodedOut))
    expect(encodedPayload.triage.verdict).toBe("crypto_or_encoding")
    expect(encodedPayload.shape).toBe("layered_encoding")

    const base32Root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-base32-"))
    await writeFile(path.join(base32Root, "encoded.txt"), "MZXW6YTBOI======", "utf8")
    const base32Out = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: base32Root } as never)
    const base32Payload = JSON.parse(String(base32Out))
    expect(base32Payload.triage.verdict).toBe("crypto_or_encoding")
    expect(base32Payload.shape).toBe("layered_encoding")

    const digestRoot = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-digest-"))
    await writeFile(path.join(digestRoot, "digest.txt"), "0123456789abcdef0123456789abcdef", "utf8")

    const digestOut = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: digestRoot } as never)
    const digestPayload = JSON.parse(String(digestOut))
    expect(digestPayload.shape).not.toBe("layered_encoding")
    expect(digestPayload.nextTool).not.toBe("ctf-encoding-chain")
  })

  it("does not pretend a description is a decodable file source", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-description-"))

    const out = await mod.default.execute(
      { target: ".", description: "Decode this layered base64/hex encoding chain.", jsonOnly: true },
      { directory: root } as never,
    )
    const payload = JSON.parse(String(out))

    expect(payload.shape).toBe("layered_encoding")
    expect(payload.nextTool).toBe("ctf-encoding-chain")
    expect(payload.inputSource).toBeUndefined()
  })

  it("classifies a remote custom protocol and extracts a bounded probe endpoint", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-"))

    const out = await mod.default.execute(
      {
        target: ".",
        description: "Custom protocol challenge: connect with nc 127.0.0.1 31337, read the banner, then send one line and receive a response.",
        jsonOnly: true,
      },
      { directory: root } as never,
    )
    const payload = JSON.parse(String(out))

    expect(payload.shape).toBe("custom_protocol")
    expect(payload.owner).toBe("ctf-misc")
    expect(payload.nextTool).toBe("ctf-proto-probe")
    expect(payload.endpoint).toEqual({ host: "127.0.0.1", port: 31337 })
    expect(payload.reference).toContain("protocol-client.md")
  })

  it("classifies Python jail and AI/ML descriptions without stealing specialist handoffs", async () => {
    const mod = await import(MOD_PATH)
    const jailRoot = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-jail-"))
    const jailOut = await mod.default.execute(
      { target: ".", description: "A Python jail blocks builtins and eval; find a bounded sandbox escape.", jsonOnly: true },
      { directory: jailRoot } as never,
    )
    const jailPayload = JSON.parse(String(jailOut))
    expect(jailPayload.shape).toBe("python_jail")
    expect(jailPayload.nextTool).toBe("ctf-python-inline")

    const mlRoot = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-ml-"))
    const mlOut = await mod.default.execute(
      { target: ".", description: "Inspect a PyTorch model and tokenizer for an adversarial ML objective.", jsonOnly: true },
      { directory: mlRoot } as never,
    )
    const mlPayload = JSON.parse(String(mlOut))
    expect(mlPayload.shape).toBe("ai_ml")
    expect(mlPayload.nextTool).toBe("ctf-artifact-analyze")
  })

  it("covers the remaining bounded Misc shape routes from description/service clues", async () => {
    const mod = await import(MOD_PATH)
    const cases = [
      ["programming_ppc", "programming challenge: solve 20 rounds of arithmetic", "nc 127.0.0.1 4000", "ctf-proto-probe"],
      ["game_state_machine", "model the game state machine and legal moves", undefined, "ctf-python-inline"],
      ["osint", "OSINT geolocation challenge using a public source timeline", undefined, "ctf-file-triage"],
      ["dns", "Find the TXT record and inspect the nameserver clue", undefined, "ctf-dns-probe"],
      ["qr_barcode", "Decode the QR code hidden in the supplied image", undefined, "ctf-qr-probe"],
      ["rf_sdr", "Inspect an SDR IQ sample and identify the modulation", undefined, "ctf-file-triage"],
    ] as const

    for (const [shape, description, service, nextTool] of cases) {
      const root = await mkdtemp(path.join(os.tmpdir(), `ctf-misc-analyze-${shape}-`))
      const out = await mod.default.execute({ target: ".", description, service, jsonOnly: true }, { directory: root } as never)
      const payload = JSON.parse(String(out))
      expect(payload.shape, shape).toBe(shape)
      expect(payload.nextTool, shape).toBe(nextTool)
      expect(payload.firstProbe).toBeTruthy()
      expect(payload.reference).toBeTruthy()
    }
  })

  it("keeps QR extraction ahead of a later base64 transform clue", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-qr-priority-"))
    const out = await mod.default.execute(
      {
        target: ".",
        description: "The supplied QR code contains a base64 payload; extract the QR first, then decode the recovered text.",
        jsonOnly: true,
      },
      { directory: root } as never,
    )
    const payload = JSON.parse(String(out))
    expect(payload.shape).toBe("qr_barcode")
    expect(payload.nextTool).toBe("ctf-qr-probe")
    expect(payload.nextArgsHint).toContain("ctf-encoding-chain")
  })

  it("normalizes native binary triage to the REV facade", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-"))
    await writeFile(path.join(root, "chall"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0]))

    const out = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.triage.verdict).toBe("binary")
    expect(payload.owner).toBe("ctf-rev")
    expect(payload.handoff).toBe("yes")
    expect(payload.nextTool).toBe("ctf-rev-analyze")
  })

  it("keeps direct flags in misc without handoff", async () => {
    const mod = await import(MOD_PATH)
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-misc-analyze-"))
    await writeFile(path.join(root, "readme.txt"), "flag{misc_facade_direct}", "utf8")

    const out = await mod.default.execute({ target: ".", jsonOnly: true }, { directory: root } as never)
    const payload = JSON.parse(String(out))

    expect(payload.triage.verdict).toBe("flag_candidate")
    expect(payload.owner).toBe("ctf-misc")
    expect(payload.handoff).toBe("maybe")
    expect(payload.nextTool).toBe("ctf-evidence-board")
  })
})
