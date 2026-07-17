import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const SRC_DIR = path.dirname(__filename)

function resolvePluginRoot(): string {
  // Source runs from repo/src.
  if (path.basename(SRC_DIR) !== "plugin") return path.resolve(SRC_DIR, "..")

  const parent = path.dirname(SRC_DIR)
  // Repository bundle runs from repo/dist/plugin.
  if (path.basename(parent) === "dist") return path.resolve(SRC_DIR, "../..")

  // Managed install runs from <opencode-config>/opencode-for-ctf/plugin.
  return parent
}

export const PLUGIN_ROOT = resolvePluginRoot()

export function lessonsDir(): string {
  return path.join(PLUGIN_ROOT, "lessons")
}

export function knowledgeDir(): string {
  return path.join(PLUGIN_ROOT, "knowledge")
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
  return path.join(PLUGIN_ROOT, "knowledge", "pwn")
}

export function ljagielloSkillsDir(): string {
  return path.join(PLUGIN_ROOT, "knowledge", "ljagiello-ctf-skills")
}
