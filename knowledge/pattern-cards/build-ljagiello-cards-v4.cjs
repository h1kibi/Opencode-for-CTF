const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v3.json')
const feedbackPath = path.join(base, 'feedback.jsonl')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v4.json')

const highValueFiles = [
  /ctf-web\/(server-side|server-side-advanced|server-side-exec|client-side|client-side-advanced|auth|auth-jwt|auth-infra|field-notes)/,
  /ctf-pwn\/(format-string|heap|rop|advanced|kernel|sandbox|field-notes)/,
  /ctf-crypto\/(rsa|modern-ciphers|prng|ecc|lattice|advanced-math|stream-ciphers|zkp|field-notes)/,
  /ctf-reverse\/(patterns|patterns-ctf|anti-analysis|tools|languages|platforms|field-notes)/,
  /ctf-forensics\/(network|disk|stego|windows|linux-forensics|signals|field-notes)/,
  /ctf-misc\/(pyjails|bashjails|encodings|games-and-vms|dns|linux-privesc)/,
]
const highValueTerms = /parser|mismatch|oracle|bypass|primitive|pivot|leak|forge|overflow|uaf|heap|format|string|rsa|nonce|padding|lattice|prng|vm|anti-debug|pcap|stego|jail|constraint|auth|jwt|ssrf|xss|sqli|upload|deserial|template|workflow/i

function readFeedback() {
  if (!fs.existsSync(feedbackPath)) return new Map()
  const map = new Map()
  for (const line of fs.readFileSync(feedbackPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const f = JSON.parse(line)
      const cur = map.get(f.cardId) || { confirmed: 0, led: 0, weak: 0, misleading: 0, falsified: 0, skipped: 0, notes: [] }
      if (f.result === 'confirmed') cur.confirmed++
      else if (f.result === 'led_to_flag') cur.led++
      else if (f.result === 'weak') cur.weak++
      else if (f.result === 'misleading') cur.misleading++
      else if (f.result === 'falsified') cur.falsified++
      else if (f.result === 'skipped') cur.skipped++
      if (f.note) cur.notes.push(f.note)
      map.set(f.cardId, cur)
    } catch {}
  }
  return map
}

function shouldPromote(card) {
  if (card.curated) return true
  const src = card.source_file || ''
  const text = `${card.title} ${card.trigger} ${card.snippet} ${card.keywords?.join(' ') || ''}`
  return highValueFiles.some((re) => re.test(src)) && highValueTerms.test(text) && (card.quality || 0) >= 4 && (card.specificity || 0) >= 3
}

const idx = JSON.parse(fs.readFileSync(input, 'utf8'))
const feedback = readFeedback()
let promoted = 0
let feedbackAdjusted = 0
const cards = idx.cards.map((card) => {
  const f = feedback.get(card.id)
  const promote = shouldPromote(card)
  if (promote && !card.curated) promoted++
  let rankDelta = promote ? 12 : 0
  let qualityDelta = promote ? 1 : 0
  let specificityDelta = 0
  if (f) {
    feedbackAdjusted++
    rankDelta += f.led * 35 + f.confirmed * 18 - f.misleading * 30 - f.weak * 12 - f.falsified * 6
    qualityDelta += f.led * 2 + f.confirmed - f.misleading * 2 - f.weak
    specificityDelta += f.confirmed - f.weak - f.misleading
  }
  return {
    ...card,
    promoted: promote,
    feedback: f || undefined,
    rank_boost: (card.rank_boost || 0) + rankDelta,
    quality: Math.max(1, Math.min(10, (card.quality || 3) + qualityDelta)),
    specificity: Math.max(1, Math.min(10, (card.specificity || 3) + specificityDelta)),
    index_version: 4,
  }
})
const meta = { ...idx.meta, version: 4, generated_at: new Date().toISOString(), cards: cards.length, promoted_cards: promoted, feedback_adjusted_cards: feedbackAdjusted, v4_features: ['promoted_high_value_cards', 'feedback_adjusted_rank', 'quality_specificity_feedback'] }
fs.writeFileSync(output, JSON.stringify({ meta, cards }, null, 2))
console.log('v4_cards=' + cards.length)
console.log('promoted=' + promoted)
console.log('feedback_adjusted=' + feedbackAdjusted)
console.log('out=' + output)
