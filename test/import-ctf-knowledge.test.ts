import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// The importer is intentionally plain ESM so tests import the runtime module directly.
// @ts-expect-error The runtime module does not ship TypeScript declarations.
import * as importerModule from "../scripts/import-ctf-knowledge.mjs"

const { TOPICS, buildCards, buildOutputs, selectedSourceRecords } = importerModule as {
  TOPICS: Array<[string, string, string, string[], string, string]>
  buildCards: (commit: string) => string
  buildOutputs: (args: { source: string; id: string }) => Promise<{
    files: Array<{ path: string; size: number }>
    commit: string
    selected: Array<{ path: string; sha256: string; bytes: number }>
    cards: string
    manifest: string
  }>
  selectedSourceRecords: (source: string) => Promise<Array<{ path: string; sha256: string; bytes: number }>>
}

const tempDirs: string[] = []

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("import-ctf-knowledge outputs", () => {
  it("records deterministic selected source metadata from index-like files", async () => {
    const source = tempDir("des-import-selected-")
    writeFileSync(path.join(source, "AI-SEARCH-INDEX.md"), "sql jwt xxe\n", "utf8")
    writeFileSync(path.join(source, "PAYLOAD-CHEATSHEET.md"), "payload notes\n", "utf8")
    writeFileSync(path.join(source, "SQL.idx.md"), "index body\n", "utf8")
    writeFileSync(path.join(source, "notes.md"), "ignored\n", "utf8")

    const records = await selectedSourceRecords(source)
    expect(records.map((record: { path: string }) => record.path)).toEqual([
      "AI-SEARCH-INDEX.md",
      "PAYLOAD-CHEATSHEET.md",
      "SQL.idx.md",
    ])
    expect(
      records.every((record: { sha256: string }) => typeof record.sha256 === "string" && record.sha256.length === 64),
    ).toBe(true)
    expect(records.every((record: { bytes: number }) => record.bytes > 0)).toBe(true)
  })

  it("builds deterministic cards from the curated topic table", () => {
    const text = buildCards("deterministic-commit")
    const parsed = JSON.parse(text) as {
      meta: { cards: number; curated_cards: number; auto_cards: number; source_commit: string }
      cards: Array<{ id: string; source: string; kind: string; retrieval_intents: string[] }>
    }
    expect(parsed.meta.cards).toBe(TOPICS.length)
    expect(parsed.meta.curated_cards).toBe(TOPICS.length)
    expect(parsed.meta.auto_cards).toBe(0)
    expect(parsed.meta.source_commit).toBe("deterministic-commit")
    expect(parsed.cards.every((card) => card.id.startsWith("des-ctf-"))).toBe(true)
    expect(parsed.cards.every((card) => card.source === "des-ctf-knowledge")).toBe(true)
    expect(parsed.cards.every((card) => card.kind === "workflow")).toBe(true)
    expect(parsed.cards.every((card) => card.retrieval_intents.includes("route-selection"))).toBe(true)
  })

  it("builds manifest and cards from a temporary mirror", async () => {
    const source = tempDir("des-import-build-")
    mkdirSync(path.join(source, "nested"), { recursive: true })
    writeFileSync(path.join(source, "AI-SEARCH-INDEX.md"), "java xxe jwt\n", "utf8")
    writeFileSync(path.join(source, "PAYLOAD-CHEATSHEET.md"), "payload matrix\n", "utf8")
    writeFileSync(path.join(source, "Java反序列化漏洞总结.idx.md"), "gadget notes\n", "utf8")
    writeFileSync(path.join(source, "nested", "extra.txt"), "mirror bytes\n", "utf8")

    const output = await buildOutputs({ source, id: "des-ctf-knowledge" })
    const manifest = JSON.parse(output.manifest) as {
      source_id: string
      generated_assets: string[]
      generated_card_count: number
      selected_index_sources: Array<{ path: string }>
      source_summary: { files: number; extension_counts: Record<string, number> }
    }
    const cards = JSON.parse(output.cards) as {
      meta: { cards: number }
      cards: Array<{ id: string; source_file: string }>
    }

    expect(manifest.source_id).toBe("des-ctf-knowledge")
    expect(manifest.generated_assets).toContain("rag/knowledge/pattern-cards/des-ctf/des-ctf.cards.v1.json")
    expect(manifest.generated_card_count).toBe(TOPICS.length)
    expect(manifest.selected_index_sources.map((record) => record.path)).toContain("AI-SEARCH-INDEX.md")
    expect(manifest.source_summary.files).toBe(4)
    expect(manifest.source_summary.extension_counts[".md"]).toBe(3)
    expect(cards.meta.cards).toBe(TOPICS.length)
    expect(cards.cards.some((card) => card.id === "des-ctf-web-xxe")).toBe(true)
    expect(cards.cards.some((card) => card.id === "des-ctf-forensics-memory")).toBe(true)
    expect(cards.cards.some((card) => card.id === "des-ctf-web-smuggling")).toBe(true)
    expect(cards.cards.some((card) => card.id === "des-ctf-crypto-rsa-routing")).toBe(true)
    expect(cards.cards.some((card) => card.id === "des-ctf-misc-pyjail")).toBe(true)
    expect(cards.cards.some((card) => card.id.startsWith("des-ctf-crypto-"))).toBe(true)
  })
})
