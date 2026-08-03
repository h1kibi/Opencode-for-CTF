import { existsSync, readFileSync } from "node:fs"
import {
  curatedCardsIndex,
  desCtfCardsIndex,
  javaWebCardsIndex,
  ljagielloCardsIndex,
  pwnCuratedIndex,
} from "../../src/asset-paths.ts"

export type KnowledgeCard = {
  id: string
  source: string
  source_file: string
  category: string
  title: string
  kind: string
  trigger: string
  first_safe_check: string
  oracle: string
  stop_rule: string
  pivot_rule: string
  keywords: string[]
  snippet: string
  [key: string]: unknown
}

export type CardIndex = {
  meta: Record<string, unknown> & { cards?: number; source_repo?: string }
  cards: KnowledgeCard[]
}

export type LoadedCardIndexes = {
  index: CardIndex
  loaded: string[]
  unavailable: string[]
}

export function defaultCardIndexPaths(): string[] {
  // Hand-curated cards first: loadCardIndexes dedups by id (first wins), so the
  // richer curated versions take precedence over auto-distilled duplicates.
  return [curatedCardsIndex(), ljagielloCardsIndex(), javaWebCardsIndex(), pwnCuratedIndex(), desCtfCardsIndex()]
}

export function loadCardIndexes(primaryPath?: string): LoadedCardIndexes {
  const paths = primaryPath ? [primaryPath] : defaultCardIndexPaths()
  const cards = new Map<string, KnowledgeCard>()
  const loaded: string[] = []
  const unavailable: string[] = []
  const metas: CardIndex["meta"][] = []

  for (const indexPath of paths) {
    if (!existsSync(indexPath)) {
      unavailable.push(indexPath)
      continue
    }
    try {
      const parsed = JSON.parse(readFileSync(indexPath, "utf8").replace(/^﻿/, "")) as CardIndex
      if (!Array.isArray(parsed.cards)) throw new Error("cards is not an array")
      loaded.push(indexPath)
      metas.push(parsed.meta ?? {})
      for (const card of parsed.cards) {
        if (!card?.id) continue
        if (!cards.has(card.id)) cards.set(card.id, card)
      }
    } catch (error) {
      unavailable.push(`${indexPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    index: {
      meta: {
        cards: cards.size,
        generated_at: "merged-runtime",
        source_repo: metas.map((meta) => String(meta.source_repo ?? "unknown")).join("+"),
        version: "merged",
        curated_cards: metas.reduce((sum, meta) => sum + Number(meta.curated_cards ?? 0), 0),
      },
      cards: [...cards.values()],
    },
    loaded,
    unavailable,
  }
}
