import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const RETROS_DIR = path.join(ROOT, "retros")
const OUTPUT = path.join(ROOT, "knowledge", "retros", "retros.index.json")

function parseArgs(argv) {
  return { check: argv.includes("--check"), write: argv.includes("--write") || !argv.includes("--check") }
}

function normalize(text) {
  return text.replace(/\r\n?/g, "\n").trim()
}

function section(text, names) {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  const match = text.match(new RegExp(`^#{1,3}\\s+(?:${escaped})\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|$)`, "im"))
  if (!match) return []
  return match[1]
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
}

function inferCategory(name, text) {
  const corpus = `${name} ${text.slice(0, 1000)}`.toLowerCase()
  for (const category of ["web", "pwn", "rev", "crypto", "forensics", "misc"]) {
    if (corpus.includes(category)) return category
  }
  return "unknown"
}

function sanitize(value) {
  return value
    .replace(/(?:flag|ctf)\{[^}\n]{1,256}\}/gi, "[REDACTED_FLAG]")
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:token|cookie|session|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
}

async function build() {
  const names = existsSync(RETROS_DIR)
    ? (await readdir(RETROS_DIR))
        .filter((name) => name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "readme.md")
        .sort()
    : []
  const retros = []
  for (const name of names) {
    const raw = normalize(await readFile(path.join(RETROS_DIR, name), "utf8"))
    const text = sanitize(raw)
    const summary =
      section(text, ["Summary", "Overview", "Winning chain"])[0] ?? text.replace(/\s+/g, " ").slice(0, 360)
    retros.push({
      id: `retro-${path
        .basename(name, ".md")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      case_id: path.basename(name, ".md"),
      outcome: /solved|flag found|winning chain/i.test(text) ? "solved" : "reviewed",
      category: inferCategory(name, text),
      summary,
      signals: section(text, ["Signals", "Key signals", "Key failure signatures"]),
      successful_primitives: section(text, ["Successful primitives", "Primitive lock moment", "Winning chain"]),
      failed_families: section(text, ["Failed families", "Dead ends", "What didn't work"]),
      missed_signals: section(text, ["Missed signals", "Oversights"]),
      route_ranking_lessons: section(text, ["Route ranking lessons", "Lessons"]),
      stability_lessons: section(text, ["Stability lessons", "Stability problems"]),
      stop_rules: section(text, ["Stop rules", "Stop rule"]),
      pivot_rules: section(text, ["Pivot rules", "Pivot rule"]),
      query_terms: Array.from(
        new Set(
          text
            .toLowerCase()
            .split(/[^a-z0-9_+.#:-]+/)
            .filter((x) => x.length >= 5),
        ),
      )
        .sort()
        .slice(0, 40),
      source_retro: `../../retros/${name}`,
      source_hash: createHash("sha256").update(raw).digest("hex"),
      sanitization: { flags_removed: true, credentials_removed: true, target_details_generalized: true },
    })
  }
  return `${JSON.stringify({ schema_version: 1, generated_at: "deterministic", description: "Sanitized runtime retrospective index.", retros }, null, 2)}\n`
}

const args = parseArgs(process.argv.slice(2))
const generated = await build()
if (args.check) {
  const current = existsSync(OUTPUT) ? await readFile(OUTPUT, "utf8") : ""
  if (current !== generated) {
    console.error(`retro index drift: ${OUTPUT}`)
    process.exit(1)
  }
  console.log(`retro_index_check_ok: ${OUTPUT}`)
} else if (args.write) {
  await mkdir(path.dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, generated)
  console.log(`retro_index_written: ${OUTPUT}`)
}
