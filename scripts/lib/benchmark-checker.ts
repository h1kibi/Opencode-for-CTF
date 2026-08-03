import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { verifyCandidateFlag } from "../../src/flag-oracle.ts"

export type BenchmarkRuleStatus = "PASS" | "FAIL" | "N/A"

export interface BenchmarkRule {
  name: string
  check: (output: string, meta: { dir: string }) => BenchmarkRuleStatus
}

export type BenchmarkFamily = "web" | "pwn" | "crypto" | "rev" | "forensics" | "misc"

type FixtureManifest = {
  schemaVersion: number
  id: string
  family: BenchmarkFamily
  difficulty?: string
  oracle: {
    expectedFlag?: string
    expectedFlagSha256?: string
    flagPattern?: string
  }
  solver?: {
    candidateFiles?: string[]
    resultDir?: string
  }
  verification?: {
    replayRequired?: boolean
    replayMarker?: string
  }
}

type FixtureResult = {
  fixtureDir: string
  manifest?: FixtureManifest
  status: "PASS" | "FAIL"
  notes: string[]
}

export type FamilyBenchmarkConfig = {
  family: BenchmarkFamily
  title: string
  targetDir: string
  rules: BenchmarkRule[]
  outputFilePattern: RegExp
  emptyArtifactHint: string
  recommendations: string
}

type YamlLine = {
  indent: number
  content: string
}

const DEFAULT_FLAG_REGEX =
  /(?:[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}|[A-Za-z0-9_@.-]{2,32}\[[^\r\n\]]{1,200}\]|flag[-_:][A-Za-z0-9_@.,:;+\-=/]{8,200})/gi

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/")
}

function relativeDisplayPath(base: string, target: string): string {
  const rel = relative(base, target)
  return toPosixPath(rel || target)
}

function readString(record: Record<string, unknown>, names: string[], required = false): string | undefined {
  for (const name of names) {
    const value = record[name]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  if (required) throw new Error(`Missing required string field: ${names[0]}`)
  return undefined
}

function readBoolean(record: Record<string, unknown>, names: string[], fallback = false): boolean {
  for (const name of names) {
    const value = record[name]
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
      if (value === "true") return true
      if (value === "false") return false
    }
  }
  return fallback
}

function readStringArray(record: Record<string, unknown>, names: string[]): string[] | undefined {
  for (const name of names) {
    const value = record[name]
    if (!Array.isArray(value)) continue
    const items = value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
    return items.length ? items : undefined
  }
  return undefined
}

function readRecord(
  record: Record<string, unknown>,
  names: string[],
  required = false,
): Record<string, unknown> | undefined {
  for (const name of names) {
    const value = record[name]
    if (isRecord(value)) return value
  }
  if (required) throw new Error(`Missing required object field: ${names[0]}`)
  return undefined
}

function stripInlineComment(text: string): string {
  let single = false
  let double = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === '"' && !single) {
      double = !double
      continue
    }
    if (ch === "'" && !double) {
      single = !single
      continue
    }
    if (ch === "#" && !single && !double) return text.slice(0, i).trimEnd()
  }
  return text.trimEnd()
}

function parseScalar(raw: string): unknown {
  const value = raw.trim()
  if (value === "") return ""
  if (value === "null" || value === "~") return null
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value)
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const body = value.slice(1, -1)
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value)
      } catch {
        return body
      }
    }
    return body.replace(/''/g, "'")
  }
  return value
}

function tokenizeYaml(raw: string): YamlLine[] {
  const lines: YamlLine[] = []
  for (const sourceLine of raw.replace(/\r\n/g, "\n").split("\n")) {
    const stripped = stripInlineComment(sourceLine)
    if (!stripped.trim()) continue
    const indent = stripped.length - stripped.trimStart().length
    lines.push({ indent, content: stripped.trim() })
  }
  return lines
}

function parseYamlDocument(raw: string): unknown {
  const lines = tokenizeYaml(raw)
  if (lines.length === 0) return {}
  const [value, index] = parseYamlBlock(lines, 0, lines[0].indent)
  if (index !== lines.length) throw new Error(`Unexpected trailing YAML content at line ${index + 1}`)
  return value
}

function parseYamlBlock(lines: YamlLine[], index: number, indent: number): [unknown, number] {
  if (index >= lines.length) return [{}, index]
  return lines[index].content.startsWith("- ")
    ? parseYamlArray(lines, index, indent)
    : parseYamlObject(lines, index, indent)
}

function parseYamlObject(lines: YamlLine[], index: number, indent: number): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {}
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new Error(`Invalid indentation near: ${line.content}`)
    if (line.content.startsWith("- ")) break
    const match = /^([^:]+):(.*)$/.exec(line.content)
    if (!match) throw new Error(`Invalid YAML mapping entry: ${line.content}`)
    const key = match[1].trim()
    const rest = match[2].trim()
    cursor += 1
    if (rest) {
      result[key] = parseScalar(rest)
      continue
    }
    if (cursor < lines.length && lines[cursor].indent > line.indent) {
      const [nested, next] = parseYamlBlock(lines, cursor, lines[cursor].indent)
      result[key] = nested
      cursor = next
    } else {
      result[key] = null
    }
  }
  return [result, cursor]
}

function parseYamlArray(lines: YamlLine[], index: number, indent: number): [unknown[], number] {
  const result: unknown[] = []
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new Error(`Invalid indentation near: ${line.content}`)
    if (!line.content.startsWith("- ")) break
    const rest = line.content.slice(2).trim()
    cursor += 1
    if (!rest) {
      if (cursor < lines.length && lines[cursor].indent > line.indent) {
        const [nested, next] = parseYamlBlock(lines, cursor, lines[cursor].indent)
        result.push(nested)
        cursor = next
      } else {
        result.push(null)
      }
      continue
    }
    const inlineObject = /^([^:]+):(.*)$/.exec(rest)
    if (inlineObject) {
      const item: Record<string, unknown> = {}
      const key = inlineObject[1].trim()
      const tail = inlineObject[2].trim()
      if (tail) item[key] = parseScalar(tail)
      else if (cursor < lines.length && lines[cursor].indent > line.indent) {
        const [nested, next] = parseYamlBlock(lines, cursor, lines[cursor].indent)
        item[key] = nested
        cursor = next
      } else item[key] = null
      if (cursor < lines.length && lines[cursor].indent > line.indent) {
        const [extra, next] = parseYamlObject(lines, cursor, lines[cursor].indent)
        Object.assign(item, extra)
        cursor = next
      }
      result.push(item)
      continue
    }
    result.push(parseScalar(rest))
  }
  return [result, cursor]
}

function normalizeFixtureManifest(raw: unknown): FixtureManifest {
  if (!isRecord(raw)) throw new Error("challenge.yaml must parse to an object")
  const id = readString(raw, ["id"], true) ?? ""
  const family = readString(raw, ["family"], true) ?? ""
  if (!family || !["web", "pwn", "crypto", "rev", "forensics", "misc"].includes(family)) {
    throw new Error(`Unsupported fixture family: ${family ?? "<missing>"}`)
  }
  const oracleRecord = readRecord(raw, ["oracle"], true)
  const expectedFlag = oracleRecord ? readString(oracleRecord, ["expectedFlag", "expected_flag"]) : undefined
  const expectedFlagSha256 = oracleRecord
    ? (readString(oracleRecord, ["expectedFlagSha256", "expected_flag_sha256"]) ??
      (expectedFlag ? sha256(expectedFlag) : undefined))
    : undefined
  const flagPattern = oracleRecord ? readString(oracleRecord, ["flagPattern", "flag_pattern"]) : undefined
  if (!expectedFlag && !expectedFlagSha256) {
    throw new Error("fixture oracle must include expectedFlag or expectedFlagSha256")
  }
  const solverRecord = readRecord(raw, ["solver"])
  const verificationRecord = readRecord(raw, ["verification"])
  return {
    schemaVersion: Number(raw.schemaVersion ?? raw.schema_version ?? 1),
    id,
    family: family as BenchmarkFamily,
    difficulty: readString(raw, ["difficulty"]),
    oracle: {
      expectedFlag,
      expectedFlagSha256,
      flagPattern,
    },
    solver: solverRecord
      ? {
          candidateFiles: readStringArray(solverRecord, ["candidateFiles", "candidate_files"]),
          resultDir: readString(solverRecord, ["resultDir", "result_dir"]),
        }
      : undefined,
    verification: verificationRecord
      ? {
          replayRequired: readBoolean(verificationRecord, ["replayRequired", "replay_required"], false),
          replayMarker: readString(verificationRecord, ["replayMarker", "replay_marker"]),
        }
      : undefined,
  }
}

function discoverFixtureDirs(root: string): string[] {
  const fixtures: string[] = []
  const visit = (dir: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.includes("challenge.yaml")) {
      fixtures.push(dir)
      return
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue
      const full = join(dir, entry)
      try {
        if (statSync(full).isDirectory()) visit(full)
      } catch {
        // unreadable entry; skip
      }
    }
  }
  visit(root)
  return fixtures.sort()
}

function findOutputFiles(dir: string, pattern: RegExp): string[] {
  const candidates: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith(".")) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) candidates.push(...findOutputFiles(full, pattern))
      else if (pattern.test(entry)) candidates.push(full)
      pattern.lastIndex = 0
    }
  } catch {
    // skip unreadable paths
  }
  return candidates.sort()
}

function collectCandidateStrings(contents: string[]): string[] {
  const seen = new Set<string>()
  const push = (value: string | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (trimmed.length > 512) return
    seen.add(trimmed)
  }
  for (const content of contents) {
    push(content)
    for (const line of content.split(/\r?\n/)) push(line)
    for (const match of content.matchAll(DEFAULT_FLAG_REGEX)) push(match[0])
  }
  return [...seen]
}

function loadFixtureManifest(fixtureDir: string): FixtureManifest {
  const file = join(fixtureDir, "challenge.yaml")
  const raw = readFileSync(file, "utf8")
  return normalizeFixtureManifest(parseYamlDocument(raw))
}

async function evaluateFixture(
  fixtureDir: string,
  family: BenchmarkFamily,
  outputFilePattern: RegExp,
): Promise<FixtureResult> {
  try {
    const manifest = loadFixtureManifest(fixtureDir)
    if (manifest.family !== family) {
      return {
        fixtureDir,
        manifest,
        status: "FAIL",
        notes: [`family mismatch: expected ${family}, manifest says ${manifest.family}`],
      }
    }

    const configuredFiles = manifest.solver?.candidateFiles?.map((value) => resolve(fixtureDir, value)) ?? []
    const fallbackRoots = [
      resolve(fixtureDir, manifest.solver?.resultDir ?? "result"),
      resolve(fixtureDir, "solver"),
      resolve(fixtureDir, "result"),
    ]
    const discovered = new Set(configuredFiles)
    for (const root of fallbackRoots) {
      if (!existsSync(root)) continue
      for (const file of findOutputFiles(root, outputFilePattern)) discovered.add(file)
    }
    const candidateFiles = [...discovered].filter((file) => existsSync(file)).sort()
    if (candidateFiles.length === 0) {
      return {
        fixtureDir,
        manifest,
        status: "FAIL",
        notes: ["solver artifacts missing: no candidate files found under result/solver roots"],
      }
    }

    const contents = candidateFiles.map((file) => readFileSync(file, "utf8"))
    const verification = await verifyCandidateFlag({
      candidates: collectCandidateStrings(contents),
      expectedFlag: manifest.oracle.expectedFlag,
      expectedFlagSha256: manifest.oracle.expectedFlagSha256,
      flagPattern: manifest.oracle.flagPattern,
    })
    if (verification.status !== "oracle-verified") {
      return {
        fixtureDir,
        manifest,
        status: "FAIL",
        notes: [
          verification.reason,
          `candidate files: ${candidateFiles.map((file) => relativeDisplayPath(fixtureDir, file)).join(", ")}`,
        ],
      }
    }

    if (manifest.verification?.replayRequired) {
      const replayMarker = resolve(
        fixtureDir,
        manifest.verification.replayMarker ?? join(manifest.solver?.resultDir ?? "result", "replay.ok"),
      )
      if (!existsSync(replayMarker)) {
        return {
          fixtureDir,
          manifest,
          status: "FAIL",
          notes: [
            "oracle verified, but replay marker is missing",
            `expected replay marker: ${relativeDisplayPath(fixtureDir, replayMarker)}`,
          ],
        }
      }
    }

    return {
      fixtureDir,
      manifest,
      status: "PASS",
      notes: [
        `oracle-verified: ${verification.reason}`,
        `candidate files: ${candidateFiles.map((file) => relativeDisplayPath(fixtureDir, file)).join(", ")}`,
        manifest.verification?.replayRequired ? "replay marker present" : "replay marker not required by fixture",
      ],
    }
  } catch (error) {
    return {
      fixtureDir,
      status: "FAIL",
      notes: [error instanceof Error ? error.message : String(error)],
    }
  }
}

async function runFixtureBenchmarks(
  config: FamilyBenchmarkConfig,
  abs: string,
  fixtureDirs: string[],
): Promise<number> {
  const results = await Promise.all(
    fixtureDirs.map((fixtureDir) => evaluateFixture(fixtureDir, config.family, config.outputFilePattern)),
  )
  console.log(`# ${config.title} Fixture Results`)
  console.log(`\n## Target: ${abs}\n`)
  console.log("| Fixture | Family | Status | Notes |")
  console.log("|---------|--------|--------|-------|")

  let pass = 0
  let fail = 0
  for (const result of results) {
    if (result.status === "PASS") pass += 1
    else fail += 1
    const fixtureName = result.manifest?.id ?? relativeDisplayPath(abs, result.fixtureDir)
    const fixtureFamily = result.manifest?.family ?? config.family
    console.log(`| ${fixtureName} | ${fixtureFamily} | ${result.status} | ${result.notes.join("; ")} |`)
  }

  console.log(`\n## Summary\n`)
  console.log(`- Fixture mode discovered ${results.length} challenge.yaml fixture(s).`)
  console.log(`- PASS: ${pass}`)
  console.log(`- FAIL: ${fail}`)
  console.log(
    "- Solved requires an independent oracle; replay markers are enforced only when the fixture declares them.",
  )
  return fail > 0 ? 1 : 0
}

function runLegacyBenchmarks(config: FamilyBenchmarkConfig, abs: string): number {
  const outputFiles = findOutputFiles(abs, config.outputFilePattern)
  let combined = ""
  for (const file of outputFiles) {
    try {
      combined += readFileSync(file, "utf8") + "\n"
    } catch {
      // skip unreadable files
    }
  }

  if (outputFiles.length === 0) {
    const allowEmpty = process.env.CTF_BENCH_ALLOW_EMPTY === "1"
    console.log(`# ${config.title}`)
    console.log(`\n## Target: ${abs}\n`)
    console.log("| Rule | Status |")
    console.log("|------|--------|")
    for (const rule of config.rules) console.log(`| ${rule.name} | SKIP |`)
    console.log(`\n## Summary\n`)
    console.log(`- No solver output files found (${config.emptyArtifactHint}).`)
    if (allowEmpty) {
      console.log(
        "- SKIP (CTF_BENCH_ALLOW_EMPTY=1 local-dev override) — this is NOT success: no solver artifacts were produced.",
      )
      return 0
    }
    console.log("- FAIL: an empty benchmark directory must not count as success.")
    console.log("- Produce solver artifacts or add a challenge fixture with an independent oracle.")
    return 1
  }

  console.log(`# ${config.title}`)
  console.log(`\n## Target: ${abs}\n`)
  console.log("| Rule | Status |")
  console.log("|------|--------|")

  let pass = 0
  let fail = 0
  const failures: string[] = []
  for (const rule of config.rules) {
    const status = rule.check(combined, { dir: abs })
    console.log(`| ${rule.name} | ${status} |`)
    if (status === "PASS") pass += 1
    if (status === "FAIL") {
      fail += 1
      failures.push(rule.name)
    }
  }

  console.log(`\n## Summary\n`)
  console.log(`- Pass Rate: ${pass}/${pass + fail + (config.rules.length - pass - fail)}`)
  if (failures.length > 0) console.log(`- Critical Failures: ${failures.join(", ")}`)
  console.log(`- Recommendations: ${config.recommendations}`)
  return fail > 0 ? 1 : 0
}

export async function runFamilyBenchmarkSuite(config: FamilyBenchmarkConfig): Promise<number> {
  const abs = resolve(config.targetDir)
  if (!existsSync(abs)) {
    console.log(`Directory not found: ${config.targetDir}`)
    return 1
  }
  const fixtureDirs = discoverFixtureDirs(abs)
  if (fixtureDirs.length > 0) return await runFixtureBenchmarks(config, abs, fixtureDirs)
  return runLegacyBenchmarks(config, abs)
}
