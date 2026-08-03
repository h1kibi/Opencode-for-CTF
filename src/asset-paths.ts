import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const SRC_DIR = path.dirname(__filename)

/**
 * Resolve the plugin root (the directory that contains rag/, templates/,
 * skills/, mcp-server/, ...) from the directory this module lives in.
 *
 * Supported layouts:
 * - source checkout:             <repo>/src/asset-paths.ts            -> <repo>
 * - repo bundle:                 <repo>/dist/plugin/index.js          -> <repo>
 * - repo bundle (shared chunks): <repo>/dist/plugin/chunks/chunk-*.js -> <repo>
 * - managed install:             <config>/opencode-for-ctf/plugin/    -> <config>/opencode-for-ctf
 * - managed install (chunks):    <config>/opencode-for-ctf/plugin/chunks/chunk-*.js
 *                                                                     -> <config>/opencode-for-ctf
 *
 * Bundled builds emit shared chunks one level below the plugin dir, so the
 * module dir basename is "chunks" instead of "plugin" there.
 *
 * The `moduleDir` parameter is injectable for tests.
 */
export function resolvePluginRoot(moduleDir: string = SRC_DIR): string {
  if (path.basename(moduleDir) !== "plugin") {
    // Bundled builds emit shared chunks under <root>/plugin/chunks.
    if (path.basename(moduleDir) === "chunks") {
      const parent = path.dirname(path.dirname(moduleDir))
      // Repository bundle: <repo>/dist/plugin/chunks -> root is <repo>.
      if (path.basename(parent) === "dist") return path.resolve(moduleDir, "../../..")
      // Managed install: <config>/opencode-for-ctf/plugin/chunks -> root is <config>/opencode-for-ctf.
      return path.resolve(moduleDir, "../..")
    }
    // Source runs from repo/src (or any other unbundled checkout).
    return path.resolve(moduleDir, "..")
  }

  const parent = path.dirname(moduleDir)
  // Repository bundle runs from repo/dist/plugin.
  if (path.basename(parent) === "dist") return path.resolve(moduleDir, "../..")

  // Managed install runs from <opencode-config>/opencode-for-ctf/plugin.
  return parent
}

export const PLUGIN_ROOT = resolvePluginRoot()

// Cache preferredDir probes: these run on hot paths and the rag/ vs legacy
// layout never changes within a process lifetime.
const preferredDirCache = new Map<string, string>()

function preferredDir(primary: string, fallback: string): string {
  const key = `${primary}${fallback}`
  const cached = preferredDirCache.get(key)
  if (cached !== undefined) return cached
  const resolved = existsSync(primary) || !existsSync(fallback) ? primary : fallback
  preferredDirCache.set(key, resolved)
  return resolved
}

export function ragDir(): string {
  return path.join(PLUGIN_ROOT, "rag")
}

export function ragKnowledgeDir(): string {
  return path.join(ragDir(), "knowledge")
}

export function desCtfKnowledgeRawDir(): string {
  return path.join(ragDir(), "Des-CTF-Knowledge")
}

// DEPRECATED: legacy pre-rag layout, kept only as a fallback for older
// installs and external checkouts. Scheduled for removal in v0.2.0.
export function legacyKnowledgeDir(): string {
  return path.join(PLUGIN_ROOT, "knowledge")
}

export function ragLessonsDir(): string {
  return path.join(ragDir(), "lessons")
}

// DEPRECATED: see legacyKnowledgeDir. Scheduled for removal in v0.2.0.
export function legacyLessonsDir(): string {
  return path.join(PLUGIN_ROOT, "lessons")
}

export function lessonsDir(): string {
  return preferredDir(ragLessonsDir(), legacyLessonsDir())
}

export function knowledgeDir(): string {
  return preferredDir(ragKnowledgeDir(), legacyKnowledgeDir())
}

export function lessonsIndexFile(): string {
  return path.join(knowledgeDir(), "lessons", "lessons.index.json")
}

export function patternCardsDir(): string {
  return path.join(knowledgeDir(), "pattern-cards")
}

export function ljagielloCardsIndex(): string {
  return path.join(patternCardsDir(), "ljagiello-ctf-skills.cards.v9.json")
}

export function javaWebCardsIndex(): string {
  return path.join(patternCardsDir(), "java-web", "java-web.cards.v1.json")
}

export function pwnCuratedIndex(): string {
  return path.join(patternCardsDir(), "pwn-curated.cards.v1.json")
}

export function curatedCardsIndex(): string {
  return path.join(patternCardsDir(), "curated-cards.json")
}

export function desCtfCardsIndex(): string {
  return path.join(patternCardsDir(), "des-ctf", "des-ctf.cards.v1.json")
}

export function retrosIndexFile(): string {
  return path.join(knowledgeDir(), "retros", "retros.index.json")
}

export function knowledgeSourcesDir(): string {
  return path.join(knowledgeDir(), "sources")
}

export function desCtfManifestFile(): string {
  return path.join(knowledgeSourcesDir(), "des-ctf-knowledge.manifest.json")
}

export function importedKnowledgeDir(): string {
  return path.join(knowledgeDir(), "imported")
}

export function importedKnowledgeSource(sourceId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(sourceId)) throw new Error(`invalid knowledge source id: ${sourceId}`)
  return path.join(importedKnowledgeDir(), sourceId)
}

export function synonymsFile(): string {
  return path.join(patternCardsDir(), "synonyms.json")
}

export function feedbackLogFile(): string {
  return path.join(patternCardsDir(), "feedback.jsonl")
}

export function templatesDir(): string {
  return path.join(PLUGIN_ROOT, "templates")
}

export function skillsPwnDir(): string {
  return preferredDir(path.join(ragKnowledgeDir(), "pwn"), path.join(legacyKnowledgeDir(), "pwn"))
}

export function secknowledgeSkillsDir(): string {
  return path.join(PLUGIN_ROOT, "skills-external", "secknowledge-skill")
}

/**
 * Compatibility facade for the historical local-skill-repo name.
 * Prefer the pinned SecKnowledge checkout, then legacy imported mirrors.
 */
export function ljagielloSkillsDir(): string {
  const external = secknowledgeSkillsDir()
  const legacyRag = path.join(ragKnowledgeDir(), "ljagiello-ctf-skills")
  const legacyKnowledge = path.join(legacyKnowledgeDir(), "ljagiello-ctf-skills")
  if (existsSync(external)) return external
  if (existsSync(legacyRag)) return legacyRag
  return legacyKnowledge
}
