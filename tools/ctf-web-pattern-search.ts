import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"

type Hit = {
  file: string
  line: number
  score: number
  text: string
}

const DEFAULT_PATTERN_DIR = "skills/ctf-web-patterns/references"

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_.$/@:-]+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
}

function scoreLine(line: string, terms: string[]): number {
  const l = line.toLowerCase()
  let score = 0

  for (const term of terms) {
    if (l.includes(term)) score += term.length >= 5 ? 2 : 1
  }

  if (/first safe check|stop rule|primitive|signal|risk|cost|value/i.test(line)) score += 1
  return score
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...await collectMarkdownFiles(full))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full)
    }
  }

  return out
}

export default tool({
  description: "Search local CTF Web pattern references for candidate exploit-pattern matches. Use only after recon and attack-queue; it does not execute payloads.",
  args: {
    query: tool.schema.string().describe("Observed signals, framework, bug family, or primitive to search for"),
    patternDir: tool.schema.string().optional().describe("Pattern reference directory. Defaults to skills/ctf-web-patterns/references"),
    maxHits: tool.schema.number().optional().describe("Maximum hits to return"),
  },
  async execute(args) {
    const root = process.cwd()
    const patternDir = path.resolve(root, args.patternDir || DEFAULT_PATTERN_DIR)
    const maxHits = Math.max(1, Math.min(args.maxHits ?? 12, 30))
    const terms = tokenize(args.query)

    if (terms.length === 0) {
      return "pattern-search: empty query"
    }

    let files: string[]
    try {
      files = await collectMarkdownFiles(patternDir)
    } catch (err) {
      return `pattern-search: cannot read pattern directory ${patternDir}: ${err}`
    }

    const hits: Hit[] = []

    for (const file of files) {
      const rel = path.relative(root, file)
      const text = await fs.readFile(file, "utf8")
      const lines = text.split(/\r?\n/)

      lines.forEach((line, index) => {
        const score = scoreLine(line, terms)
        if (score > 0) {
          hits.push({
            file: rel,
            line: index + 1,
            score,
            text: line.trim().slice(0, 240),
          })
        }
      })
    }

    hits.sort((a, b) => b.score - a.score)

    if (hits.length === 0) {
      return [
        `pattern-search: no matches for ${args.query}`,
        "Stay with recon/attack-queue. Do not invent a pattern.",
      ].join("\n")
    }

    const selected = hits.slice(0, maxHits)
    const rows = [
      "File | Line | Score | Match",
      "--- | ---: | ---: | ---",
      ...selected.map((h) => `${h.file} | ${h.line} | ${h.score} | ${h.text.replace(/\|/g, "\\|")}`),
    ]

    return [
      `Pattern matches for: ${args.query}`,
      "",
      ...rows,
      "",
      "Use rule: convert a selected pattern into one low-risk focused probe, then return to attack-queue if no stronger primitive is confirmed.",
    ].join("\n")
  },
})
