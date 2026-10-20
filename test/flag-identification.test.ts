import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  classifyFlagCandidate,
  extractFlagCandidates,
  findFlags,
  hasFlagSourceContext,
} from "../packages/ctf-core/src/flag-rules.ts"
import { verifyCandidateFlag } from "../src/flag-oracle.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("strict default flag identification", () => {
  it("accepts only the strict braced shape by default", () => {
    expect(classifyFlagCandidate("flag{Abc_123-xyz!}")?.confidence).toBe("high")
    expect(classifyFlagCandidate("DAS3{A1_b2-C3!d4}")?.kind).toBe("braced")
    expect(findFlags("flag{test} flag{valid_payload-1} CTF{too short}")).toEqual(["flag{valid_payload-1}"])
    expect(classifyFlagCandidate("flag{with spaces-not-allowed}")).toBeUndefined()
  })

  it("accepts UUID flags and rejects malformed or undersized payloads", () => {
    const uuid = "flag{123e4567-e89b-12d3-a456-426614174000}"
    expect(classifyFlagCandidate(uuid)?.kind).toBe("uuid")
    expect(classifyFlagCandidate("flag{short}")).toBeUndefined()
    expect(classifyFlagCandidate(`flag{${"a".repeat(61)}}`)).toBeUndefined()
  })

  it("requires explicit flag context for bare MD5/SHA256 values", () => {
    const md5 = "0123456789abcdef0123456789abcdef"
    const sha = "a".repeat(64)
    expect(hasFlagSourceContext({ source: "/tmp/flag.txt", origin: "file" })).toBe(true)
    expect(hasFlagSourceContext({ source: "/tmp/.flag", origin: "file" })).toBe(true)
    expect(hasFlagSourceContext({ source: "/tmp/flag.png", origin: "file" })).toBe(false)
    expect(hasFlagSourceContext({ text: "cat /flag\\n" })).toBe(true)
    expect(hasFlagSourceContext({ text: "cat flag.png\\n" })).toBe(false)
    expect(classifyFlagCandidate(md5)).toBeUndefined()
    expect(classifyFlagCandidate(md5, { source: "/tmp/flag.txt", origin: "file" })?.confidence).toBe("medium")
    expect(classifyFlagCandidate(sha, { text: "cat /flag\\n" })?.kind).toBe("bare-sha256")
    expect(extractFlagCandidates(`hash=${sha}`, { text: `hash=${sha}` })).toEqual([])
    expect(extractFlagCandidates(`flag hash=${sha}`, { text: `flag hash=${sha}` })).toEqual([])
    expect(extractFlagCandidates(`readflag: ${sha}`, { text: `readflag: ${sha}` })[0]?.kind).toBe("bare-sha256")
  })

  it("does not promote a format-only or short candidate through the generic oracle", async () => {
    await expect(verifyCandidateFlag({ candidates: ["flag{short}"] })).resolves.toMatchObject({
      status: "rejected",
    })
    await expect(verifyCandidateFlag({ candidates: ["flag{valid_payload-1}"] })).resolves.toMatchObject({
      status: "candidate",
    })
    await expect(
      verifyCandidateFlag({ candidates: ["flag{short}"], expectedFlag: "flag{short}" }),
    ).resolves.toMatchObject({
      status: "oracle-verified",
    })
  })

  it("allows a bare hash only when the candidate carries flag-file context", async () => {
    const sha = createHash("sha256").update("flag-content", "utf8").digest("hex")
    await expect(
      verifyCandidateFlag({ candidates: [sha], candidateContext: { source: "/flag", origin: "file" } }),
    ).resolves.toMatchObject({ status: "candidate" })
    await expect(verifyCandidateFlag({ candidates: [sha] })).resolves.toMatchObject({ status: "rejected" })
  })
})

describe("ctf-flag-grep integration", () => {
  it("reports strict candidates and context-qualified bare hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ctf-flag-grep-rules-"))
    roots.push(root)
    const flagFile = join(root, "flag.txt")
    const notes = join(root, "notes.txt")
    await writeFile(flagFile, "0123456789abcdef0123456789abcdef", "utf8")
    await writeFile(notes, "flag{test} and hash=0123456789abcdef0123456789abcdef", "utf8")
    const mod = await import("../tools/core/ctf-flag-grep.ts")
    const out = String(await mod.default.execute({ target: root }, { directory: root, worktree: root } as never))
    expect(out).toContain("flag.txt")
    expect(out).toContain("bare-md5")
    expect(out.split("\n").some((line) => line.includes("notes.txt: "))).toBe(false)
  })
})
