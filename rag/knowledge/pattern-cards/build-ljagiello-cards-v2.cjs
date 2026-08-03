const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.json')
const curated = path.join(base, 'curated-cards.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v2.json')

function quality(card) {
  let q = 3
  const text = `${card.title} ${card.trigger} ${card.snippet} ${card.source_file}`.toLowerCase()
  if (card.kind === 'technique') q += 1
  if (card.kind === 'workflow' || card.kind === 'pivot') q += 2
  if (/field-notes|advanced|patterns|server-side|client-side|auth|rsa|heap|format|rop|network|stego|pyjails|anti-analysis/.test(card.source_file)) q += 1
  if (/oracle|leak|bypass|primitive|pivot|first|workflow|pattern|attack|check/.test(text)) q += 1
  if (/flag|writeup|challenge title/.test(text)) q -= 1
  return Math.max(1, Math.min(q, 8))
}

function specificity(card) {
  let s = 3
  const text = `${card.title} ${card.trigger} ${card.keywords?.join(' ') || ''}`.toLowerCase()
  const hits = ['rsa','jwt','xss','ssrf','heap','format string','tcache','coppersmith','lattice','pcap','pyjail','custom vm','padding oracle','gcm','precheck','include','postmessage','oauth','idor','lfi','rop','seccomp'].filter(k => text.includes(k)).length
  s += Math.min(hits, 4)
  if ((card.title || '').length > 6 && (card.title || '').length < 90) s += 1
  return Math.max(1, Math.min(s, 8))
}

function conditions(card) {
  const c = card.category
  if (c === 'web') return ['evidence-backed route/input/sink exists', 'one observable HTTP/browser oracle exists']
  if (c === 'pwn') return ['binary/service behavior reproducible', 'protections and primitive candidate identified']
  if (c === 'crypto') return ['parameters/samples/oracle extracted', 'flag format or plaintext structure considered']
  if (c === 'reverse') return ['validation/transform target identified', 'static or dynamic oracle available']
  if (c === 'forensics') return ['artifact type identified', 'safe extraction/triage performed']
  if (c === 'misc') return ['oracle or transform model identified', 'manual guessing avoided']
  return ['evidence supports this pattern']
}

function confirm(card) {
  if (card.category === 'web') return 'A one-variable request/browser action produces the expected route, parser, auth, state, or sink differential.'
  if (card.category === 'pwn') return 'A reproducible leak, write, crash-control, or win-path primitive is observed.'
  if (card.category === 'crypto') return 'The predicted key/plaintext/seed/signature/decryption verifies against the challenge oracle.'
  if (card.category === 'reverse') return 'The extracted model predicts validation behavior or recovers accepted input bytes.'
  if (card.category === 'forensics') return 'A new layer/artifact/fragment/credential/flag-like evidence is extracted.'
  if (card.category === 'misc') return 'The solver/escape/decode step advances to a stronger oracle or next layer.'
  return 'The first safe check produces expected evidence.'
}

function falsify(card) {
  return 'The first safe check is reachable but produces no expected oracle or differential under controlled conditions.'
}

const src = JSON.parse(fs.readFileSync(input, 'utf8'))
const cur = JSON.parse(fs.readFileSync(curated, 'utf8'))
const autoCards = src.cards.map((card) => ({
  ...card,
  quality: quality(card),
  specificity: specificity(card),
  preconditions: conditions(card),
  confirm: confirm(card),
  falsify: falsify(card),
  curated: false,
}))
const curatedCards = cur.cards.map((card) => ({
  ...card,
  source: 'curated+ljagiello/ctf-skills',
  curated: true,
  keywords: card.keywords || [],
  snippet: card.trigger,
}))
const cards = [...curatedCards, ...autoCards]
const meta = {
  generated_at: new Date().toISOString(),
  source_repo: src.meta.source_repo,
  auto_cards: autoCards.length,
  curated_cards: curatedCards.length,
  cards: cards.length,
  version: 2,
}
fs.writeFileSync(output, JSON.stringify({ meta, cards }, null, 2))
console.log('v2_cards=' + cards.length)
console.log('curated=' + curatedCards.length)
console.log('auto=' + autoCards.length)
console.log('out=' + output)
