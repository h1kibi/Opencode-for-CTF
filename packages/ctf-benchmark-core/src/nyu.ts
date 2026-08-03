import { createHash } from "node:crypto"
import { cp, lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { verifyFlag, type ChallengeOracle, type OracleResult } from "./oracle.ts"

export const NYU_CATEGORIES = ["web", "pwn", "forensics", "rev", "crypto", "misc"] as const
export type NyuCategory = (typeof NYU_CATEGORIES)[number]
export type NyuSplit = "development" | "test"

export type NyuDatasetEntry = {
  id?: string
  year: string | number
  event: string
  category: NyuCategory
  challenge: string
  path: string
}

type NyuChallengeJson = {
  name?: string
  category?: NyuCategory
  description?: string
  flag?: string
  files?: string[]
  compose?: boolean
  [key: string]: unknown
}

export type NyuPublicChallenge = {
  id: string
  source: "nyu-ctf-bench"
  split: NyuSplit
  category: NyuCategory
  year: string
  event: string
  name: string
  description: string
  files: string[]
  hasService: boolean
}

export type NyuPreparedChallenge = {
  publicChallenge: NyuPublicChallenge
  /** Keep this object in the runner process; never serialize it into the agent workspace. */
  privateOracle: ChallengeOracle
  sourceDir: string
  metadataPath: string
  composePath?: string
}

export type LoadNyuOptions = {
  datasetJson: string
  datasetRoot?: string
  split: NyuSplit
  ids?: string[]
  categories?: NyuCategory[]
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex")
}

function isCategory(value: unknown): value is NyuCategory {
  return typeof value === "string" && (NYU_CATEGORIES as readonly string[]).includes(value)
}

function normalizeId(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function inside(root: string, target: string): boolean {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`
  return targetPath === rootPath || targetPath.startsWith(prefix)
}

function requireRelativeFile(root: string, value: string, label: string): string {
  if (!value || isAbsolute(value)) throw new Error(`${label} must be a relative path`)
  const resolved = resolve(root, value)
  if (!inside(root, resolved)) throw new Error(`${label} escapes the challenge directory: ${value}`)
  return resolved
}

function publicFiles(challengeRoot: string, files: unknown): string[] {
  if (!Array.isArray(files)) return []
  const result: string[] = []
  for (const value of files) {
    if (typeof value !== "string" || !value.trim()) continue
    const normalized = value.replaceAll("\\", "/")
    const base = normalized.split("/").at(-1)?.toLowerCase()
    if (base === "challenge.json" || base === "docker-compose.yml" || base === "docker-compose.yaml") {
      continue
    }
    const path = requireRelativeFile(challengeRoot, normalized, "challenge file")
    if (!result.includes(path)) result.push(path)
  }
  return result
}

function entryId(entry: NyuDatasetEntry, key?: string): string {
  const candidate = normalizeId(entry.id ?? key ?? "")
  if (candidate) return candidate
  return normalizeId(`${entry.year}-${entry.event}-${entry.category}-${entry.challenge}`)
}

function normalizeEntry(raw: unknown, key?: string): NyuDatasetEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("NYU dataset entry must be an object")
  const record = raw as Record<string, unknown>
  const year = String(record.year ?? "").trim()
  const event = String(record.event ?? "").trim()
  const category = record.category
  const challenge = String(record.challenge ?? record.name ?? "").trim()
  const path = String(record.path ?? "").trim()
  if (!year || !event || !isCategory(category) || !challenge || !path) {
    throw new Error(`Invalid NYU dataset entry${key ? ` ${key}` : ""}`)
  }
  return { id: typeof record.id === "string" ? record.id : key, year, event, category, challenge, path }
}

function normalizeDataset(raw: unknown): Array<{ key?: string; entry: NyuDatasetEntry }> {
  if (Array.isArray(raw)) return raw.map((entry) => ({ entry: normalizeEntry(entry) }))
  if (!raw || typeof raw !== "object") throw new Error("NYU dataset JSON must be an object or array")
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    key,
    entry: normalizeEntry(value, key),
  }))
}

async function prepareChallenge(entry: NyuDatasetEntry, key: string | undefined, datasetRoot: string, split: NyuSplit) {
  const sourceCandidate = requireRelativeFile(datasetRoot, entry.path, "challenge path")
  const sourceDir = await realpath(sourceCandidate)
  if (!inside(datasetRoot, sourceDir)) throw new Error(`challenge path escapes the dataset directory: ${entry.path}`)
  const metadataCandidate = join(sourceDir, "challenge.json")
  const metadataPath = await realpath(metadataCandidate)
  if (!inside(sourceDir, metadataPath)) throw new Error("challenge metadata symlink escapes the challenge directory")
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as NyuChallengeJson
  const flag = typeof metadata.flag === "string" ? metadata.flag.trim() : ""
  if (!flag) throw new Error(`NYU challenge ${entryId(entry, key)} has no flag in challenge.json`)
  if (metadata.category && metadata.category !== entry.category) {
    throw new Error(`NYU challenge ${entryId(entry, key)} category disagrees with dataset index`)
  }

  const files = publicFiles(sourceDir, metadata.files)
  const id = entryId(entry, key)
  const name = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : entry.challenge
  const description = typeof metadata.description === "string" ? metadata.description : ""
  const composeName = metadata.compose
    ? (await fileExists(join(sourceDir, "docker-compose.yaml")))
      ? "docker-compose.yaml"
      : "docker-compose.yml"
    : undefined
  const composeCandidate = composeName ? join(sourceDir, composeName) : undefined
  const composePath = composeCandidate ? await realpath(composeCandidate) : undefined
  if (composePath && !inside(sourceDir, composePath)) {
    throw new Error("docker compose symlink escapes the challenge directory")
  }
  return {
    publicChallenge: {
      id,
      source: "nyu-ctf-bench" as const,
      split,
      category: entry.category,
      year: String(entry.year),
      event: entry.event,
      name,
      description: description.replaceAll(flag, "[REDACTED_FLAG]"),
      files: files.map((file) => relative(sourceDir, file).replaceAll("\\", "/")),
      hasService: Boolean(composeName),
    },
    privateOracle: { id, family: entry.category, expectedFlagSha256: sha256(flag) },
    sourceDir,
    metadataPath,
    composePath,
  } satisfies NyuPreparedChallenge
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

export async function loadNyuChallenges(options: LoadNyuOptions): Promise<NyuPreparedChallenge[]> {
  const datasetJson = resolve(options.datasetJson)
  const datasetRoot = await realpath(resolve(options.datasetRoot ?? dirname(datasetJson)))
  const datasetText = await readFile(datasetJson, "utf8")
  const dataset = normalizeDataset(JSON.parse(datasetText.replace(/^\uFEFF/, "")))
  const wanted = options.ids ? new Set(options.ids) : undefined
  const categories = options.categories ? new Set(options.categories) : undefined
  const selected = dataset.filter(({ key, entry }) => {
    const id = entryId(entry, key)
    return (!wanted || wanted.has(id)) && (!categories || categories.has(entry.category))
  })
  const prepared = []
  for (const { key, entry } of selected) prepared.push(await prepareChallenge(entry, key, datasetRoot, options.split))
  return prepared
}

export async function materializeNyuAgentWorkspace(
  challenge: NyuPreparedChallenge,
  destination: string,
): Promise<string[]> {
  const target = resolve(destination)
  try {
    const existing = await readdir(target)
    if (existing.length > 0)
      throw new Error("agent workspace must be empty; use a fresh directory to prevent stale answer leakage")
  } catch (error) {
    if (error instanceof Error && error.message.includes("agent workspace must be empty")) throw error
    await mkdir(target, { recursive: true })
  }
  const copied: string[] = []
  for (const relativePath of challenge.publicChallenge.files) {
    const sourceCandidate = requireRelativeFile(challenge.sourceDir, relativePath, "public challenge file")
    const source = await realpath(sourceCandidate)
    if (!inside(challenge.sourceDir, source))
      throw new Error(`public challenge file escapes the challenge directory: ${relativePath}`)
    if ((await lstat(source)).isDirectory()) {
      throw new Error(`public challenge file must be a file, not a directory: ${relativePath}`)
    }
    const destinationPath = requireRelativeFile(target, relativePath, "agent destination")
    await mkdir(dirname(destinationPath), { recursive: true })
    await cp(source, destinationPath, { recursive: true, errorOnExist: false, force: true })
    copied.push(relativePath)
  }
  await writeFile(
    join(target, "challenge-info.json"),
    `${JSON.stringify(challenge.publicChallenge, null, 2)}\n`,
    "utf8",
  )
  return copied
}

export function assertNyuChallengeBoundary(challenge: NyuPreparedChallenge): void {
  if (!inside(challenge.sourceDir, challenge.metadataPath)) throw new Error("NYU metadata escaped challenge boundary")
  if (challenge.composePath && !inside(challenge.sourceDir, challenge.composePath)) {
    throw new Error("NYU compose file escaped challenge boundary")
  }
  if (challenge.publicChallenge.files.some((file) => file.toLowerCase() === "challenge.json")) {
    throw new Error("NYU challenge metadata must never be exposed to the agent")
  }
}

export function verifyNyuCandidates(challenge: NyuPreparedChallenge, candidates: string[]): OracleResult {
  for (const candidate of candidates) {
    const result = verifyFlag(challenge.privateOracle, candidate)
    if (result.solved) return result
  }
  return {
    solved: false,
    reason: candidates.length ? "no candidate matched the NYU exact flag oracle" : "no candidate flags supplied",
  }
}
