import { describe, expect, it } from "vitest"
import { decideRoute, pickMode, scoreCategories, type CategoryScore } from "../packages/ctf-core/src/index.ts"

type Labeled = { text: string; category: string; note?: string }

/** Hand-labeled routing corpus: realistic challenge descriptions per family. */
const CORPUS: Labeled[] = [
  // web
  { text: "http://chall.example.com flask app with admin bot, cookie session puzzle", category: "web" },
  { text: "flask ssti in the render template, find the flag in the jinja output", category: "web" },
  { text: "express node.js app, jwt auth bypass, sourcemap leak at /static/app.js.map", category: "web" },
  { text: "graphql endpoint with idor, fetch other users' orders", category: "web" },
  { text: "php upload filter bypass to rce, .htaccess tricks", category: "web" },
  // pwn
  { text: "nc pwn.example.com 1337, checksec shows NX enabled, ret2libc with provided libc.so.6", category: "pwn" },
  { text: "elf binary heap menu with uaf and tcache poisoning, glibc 2.31", category: "pwn" },
  { text: "format string leak the canary then rop to win, seccomp orw shellcode", category: "pwn" },
  { text: "srop after stack overflow, sigreturn frame to execve", category: "pwn" },
  { text: "got overwrite on a small elf, partial RELRO, plt resolver", category: "pwn" },
  // rev
  { text: "crackme binary packed with upx, anti-debug checks, find the serial", category: "rev" },
  { text: "apk with obfuscated smali, apktool decode and trace the check", category: "rev" },
  { text: "ghidra the windows exe, vmProtect-like custom bytecode vm", category: "rev" },
  { text: "pyc file, decompile the python bytecode to recover the algorithm", category: "rev" },
  { text: "godot game pack, gdc resource scan for the hidden flag", category: "rev" },
  // crypto
  { text: "rsa with small e and structured padding, coppersmith attack", category: "crypto" },
  { text: "aes-cbc padding oracle on the server, decrypt step by step", category: "crypto" },
  { text: "ecdsa nonce reuse, recover the private key from two signatures", category: "crypto" },
  { text: "lfsr based prng stream cipher, recover the state with z3", category: "crypto" },
  { text: "lattice lll reduction on the knapsack ciphertext", category: "crypto" },
  // forensics
  { text: "pcap of a malicious http session, carve the exfiltrated file", category: "forensics" },
  { text: "disk image with deleted registry hives, evtx timeline analysis", category: "forensics" },
  { text: "memory dump volatility profile, find the injected shellcode", category: "forensics" },
  { text: "stego png with appended zip, least significant bit extraction", category: "forensics" },
  { text: "mft and prefetch artifacts, reconstruct attacker actions", category: "forensics" },
  // misc
  { text: "pyjail escape with restricted builtins eval sandbox", category: "misc" },
  { text: "qr code puzzle chain, each qr holds part of the key", category: "misc" },
  { text: "esoteric brainfuck interpreter challenge", category: "misc" },
  { text: "osint geolocation from photo metadata", category: "misc" },
  { text: "embedded firmware rf sdr signal demodulation", category: "misc" },
  // aisec
  { text: "prompt injection against a rag chatbot to leak the system prompt", category: "aisec" },
  { text: "llm agent with tool calling, adversarial input triggers arbitrary command execution", category: "aisec" },
  { text: "adversarial ml model weights inspection, extract the hidden backdoor trigger", category: "aisec" },
]

describe("router category accuracy (labeled corpus)", () => {
  it("classifies at least 80% of labeled challenge descriptions to the right top category", () => {
    const misses: string[] = []
    for (const item of CORPUS) {
      const decision = decideRoute({ text: item.text, mode: "auto" })
      if (decision.category !== item.category) {
        misses.push(`${item.text.slice(0, 40)}… → ${decision.category ?? "none"} (expected ${item.category})`)
      }
    }
    const accuracy = 1 - misses.length / CORPUS.length
    expect(
      accuracy,
      `category accuracy ${(accuracy * 100).toFixed(1)}% < 80%:\n${misses.join("\n")}`,
    ).toBeGreaterThanOrEqual(0.8)
  })

  it("does not award explicit-category bonus for negated category tokens", () => {
    const scores = scoreCategories({ text: "this is not a web challenge, it is pure rsa math" })
    const web = scores.find((s) => s.category === "web")
    const crypto = scores.find((s) => s.category === "crypto")
    expect(web?.reasons.some((r) => r.includes("negated"))).toBe(true)
    expect(crypto?.score).toBeGreaterThan(web?.score ?? 0)
  })
})

function score(category: string, value: number): CategoryScore {
  return { category: category as CategoryScore["category"], score: value, reasons: [] }
}

describe("pickMode decision table", () => {
  const input = { mode: "auto" as const }

  function modeFor(topScore: number, secondScore: number, thirdScore = 0): "fast" | "expert" {
    const ranked = [
      score("web", topScore),
      score("pwn", secondScore),
      score("rev", thirdScore),
      score("crypto", 0),
      score("forensics", 0),
      score("misc", 0),
    ]
    return pickMode({ text: "" }, ranked[0], ranked)
  }

  it("fast requires strong single-category signal (>=40 & lead >=12, or >=22 with <3 positive)", () => {
    expect(modeFor(45, 10)).toBe("fast")
    expect(modeFor(40, 28)).toBe("fast")
    expect(modeFor(30, 5, 0)).toBe("fast")
    expect(modeFor(22, 0)).toBe("fast")
  })

  it("weak or ambiguous signals route to expert", () => {
    expect(modeFor(45, 40)).toBe("expert") // strong but contested (lead < 12)
    expect(modeFor(10, 0)).toBe("expert") // too little signal
    expect(modeFor(21, 0)).toBe("expert") // below the 22 fast floor
    expect(modeFor(30, 10, 10)).toBe("expert") // three positive categories
    expect(modeFor(0, 0)).toBe("expert") // no signal
  })

  it("forced modes bypass the table", () => {
    const ranked = [score("web", 0), score("pwn", 0)]
    expect(pickMode({ mode: "fast" }, ranked[0], ranked)).toBe("fast")
    expect(pickMode({ mode: "expert" }, ranked[0], ranked)).toBe("expert")
  })

  it("covers the decision space with a literal expectation table", () => {
    // Literal table, NOT a formula mirroring the implementation — a formula
    // only catches transcription errors, while this table makes any decision
    // change an explicit, reviewable diff.
    const table: Array<{ top: number; second: number; third?: number; expected: "fast" | "expert" }> = [
      { top: 0, second: 0, expected: "expert" },
      { top: 1, second: 0, expected: "expert" },
      { top: 15, second: 0, expected: "expert" },
      { top: 16, second: 0, expected: "expert" }, // below the 22 fast floor
      { top: 21, second: 0, expected: "expert" },
      { top: 22, second: 0, expected: "fast" },
      { top: 39, second: 0, expected: "fast" },
      { top: 40, second: 28, expected: "fast" }, // lead exactly 12 passes
      { top: 40, second: 29, expected: "expert" }, // contested: lead < 12
      { top: 45, second: 33, expected: "fast" },
      { top: 45, second: 40, expected: "expert" }, // contested strong signal
      { top: 30, second: 5, expected: "fast" },
      { top: 30, second: 10, third: 10, expected: "expert" }, // three positives
      { top: 30, second: 10, expected: "fast" },
      { top: 50, second: 30, third: 1, expected: "fast" }, // strong lead beats a noise-level third
      { top: 50, second: 42, third: 5, expected: "expert" }, // contested + multi-category
      { top: 60, second: 0, expected: "fast" },
    ]
    for (const row of table) {
      expect(
        modeFor(row.top, row.second, row.third ?? 0),
        `top=${row.top} second=${row.second} third=${row.third ?? 0}`,
      ).toBe(row.expected)
    }
  })

  it("stays robust on verbose, noisy challenge descriptions", () => {
    const verbose = [
      {
        text: "hi team, our ctf admin attached this pwn task: nc pwn.example.com 1337, the binary is an elf, checksec shows NX and partial RELRO, they gave us libc.so.6 and ld-linux, previous players mentioned the heap menu has a use-after-free, also sorry for the long description we also had cookies and coffee and a web dashboard for the scoreboard",
        category: "pwn",
      },
      {
        text: "long writeup context: we captured a pcap during the incident, the memory dump image is huge, there is also a random jpg from the chat and someone swears it is stego, plus the usual scoreboard web page link for submissions and a zip of prefetch files",
        category: "forensics",
      },
      {
        text: "very long post: the challenge gives a url http://chall.example.com running flask with a session cookie puzzle, an admin bot visits links, there is also a static pdf with instructions and everyone in the thread argues about sqli vs xss vs ssti, upload endpoint exists too",
        category: "web",
      },
    ]
    for (const item of verbose) {
      const decision = decideRoute({ text: item.text, mode: "auto" })
      expect(decision.category, item.text.slice(0, 50)).toBe(item.category)
    }
  })

  it("exports pickMode for the table contract", () => {
    expect(typeof pickMode).toBe("function")
    expect(input.mode).toBe("auto")
  })
})
