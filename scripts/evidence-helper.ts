import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs"
import { resolve, join } from "path"

export type EvidenceKind = "route" | "primitive" | "closure" | "hypotheses" | "signal-memory" | "inventory"

export const TARGETS: Record<EvidenceKind, string> = {
  route: "route.json",
  primitive: "primitive.json",
  closure: "closure.json",
  hypotheses: "hypotheses.json",
  "signal-memory": "signal-memory.yaml",
  inventory: "inventory.md",
}

export const PREFERRED_RESTART_FILES = ["resume.md", "fast-handoff.md", "handoff.md", "snapshot.md"] as const

export const STRUCTURED_STATE_FILES = [
  "route.json",
  "primitive.json",
  "closure.json",
  "hypotheses.json",
  "signal-memory.yaml",
  "inventory.md",
] as const

export function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

export function getEvidenceDir(root: string, slug: string) {
  return resolve(root, "work", "ctf-evidence", slug)
}

export function getTemplatePath(root: string, filename: string) {
  return resolve(root, "templates", filename)
}

export function getTargetPath(root: string, slug: string, filename: string) {
  return join(getEvidenceDir(root, slug), filename)
}

export function ensureFileFromTemplate(target: string, template: string) {
  if (!existsSync(target)) copyFileSync(template, target)
}

export function bootstrapEvidenceDir(root: string, slug: string) {
  const outDir = getEvidenceDir(root, slug)
  ensureDir(outDir)

  const pairs: Array<[string, string]> = [
    ["route.json", "route.json"],
    ["primitive.json", "primitive.json"],
    ["closure.json", "closure.json"],
    ["hypotheses.json", "hypotheses.json"],
    ["signal-memory.yaml", "signal-memory.yaml"],
    ["inventory.md", "inventory.md"],
    ["ctf_resume_packet.md", "resume.md"],
    ["ctf_handoff.md", "handoff.md"],
    ["ctf_fast_handoff.md", "fast-handoff.md"],
    ["ctf_evidence_snapshot.md", "snapshot.md"],
  ]

  for (const [templateName, filename] of pairs) {
    ensureFileFromTemplate(getTargetPath(root, slug, filename), getTemplatePath(root, templateName))
  }

  return outDir
}

export function parsePatch(raw: string) {
  if (raw.trim().startsWith("{")) return JSON.parse(raw) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const part of raw.split(",")) {
    const [key, ...rest] = part.split("=")
    if (!key || rest.length === 0) continue
    patch[key.trim()] = rest.join("=").trim()
  }
  return patch
}

export function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>) {
  if (base.challenge && patch.challenge && typeof base.challenge === "object" && typeof patch.challenge === "object") {
    return {
      ...base,
      ...patch,
      challenge: {
        ...(base.challenge as Record<string, unknown>),
        ...(patch.challenge as Record<string, unknown>),
      },
    }
  }
  return { ...base, ...patch }
}

function writeTextFile(target: string, patch: Record<string, unknown>) {
  const lines = Object.entries(patch).map(([key, value]) => `- ${key}: ${String(value)}`)
  const content = ["# Structured Update", "", ...lines, "", `- last_updated: ${new Date().toISOString()}`, ""].join(
    "\n",
  )
  writeFileSync(target, content)
}

export function writeEvidenceState(root: string, kind: EvidenceKind, slug: string, rawPatch: string) {
  const filename = TARGETS[kind]
  const outDir = bootstrapEvidenceDir(root, slug)
  const target = join(outDir, filename)
  const patch = parsePatch(rawPatch)

  if (filename.endsWith(".json")) {
    const base = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>
    const merged = mergeRecord(base, patch) as Record<string, unknown>
    merged.last_updated = new Date().toISOString()
    writeFileSync(target, JSON.stringify(merged, null, 2) + "\n")
  } else {
    writeTextFile(target, patch)
  }

  return target
}

export function readEvidenceState(root: string, kind: EvidenceKind, slug: string) {
  const target = getTargetPath(root, slug, TARGETS[kind])
  if (!existsSync(target)) return null
  const raw = readFileSync(target, "utf8")
  if (target.endsWith(".json")) return JSON.parse(raw)
  return {
    kind,
    path: target,
    content: raw,
  }
}

export function readPreferredRestartPath(root: string, slug: string) {
  const base = getEvidenceDir(root, slug)
  for (const filename of PREFERRED_RESTART_FILES) {
    const full = join(base, filename)
    if (existsSync(full)) return full
  }
  return null
}

export function listExistingEvidenceFiles(root: string, slug: string) {
  const base = getEvidenceDir(root, slug)
  return [...PREFERRED_RESTART_FILES, ...STRUCTURED_STATE_FILES].filter((filename, index, all) => {
    if (all.indexOf(filename) !== index) return false
    return existsSync(join(base, filename))
  })
}
