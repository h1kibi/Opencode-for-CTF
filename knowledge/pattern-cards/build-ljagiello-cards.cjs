const fs = require('fs')
const path = require('path')
const repo = 'C:/Users/Administrator/.config/opencode/knowledge/ljagiello-ctf-skills'
const out = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.json'

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.md$/i.test(name)) acc.push(p)
  }
  return acc
}

function categoryFromRel(rel) {
  const m = rel.match(/^(ctf-[^/]+)/)
  return m ? m[1].replace(/^ctf-/, '') : 'general'
}

function norm(s) {
  return s.replace(/`+/g, '').replace(/\s+/g, ' ').trim()
}

function kind(text) {
  const t = text.toLowerCase()
  if (/pivot|when to pivot/.test(t)) return 'pivot'
  if (/workflow|first-pass|problem-solving/.test(t)) return 'workflow'
  if (/quick|command/.test(t)) return 'quick-check'
  if (/pattern|bypass|attack|exploit|oracle|primitive|technique|leak|forg|overflow|injection|ssrf|xss|sqli|rsa|aes|lattice|heap|rop|stego|pcap|jail/.test(t)) return 'technique'
  return 'note'
}

function safeCheck(category, text) {
  const t = text.toLowerCase()
  if (category === 'web') {
    if (/parser|normalization|url|wrapper|include|file|path/.test(t)) return 'Build precheck/sink equation; test one parser or path semantic differential with a harmless marker.'
    if (/xss|csp|dom|bot/.test(t)) return 'Map reflection/runtime context and run one harmless browser/admin-bot canary.'
    if (/auth|jwt|oauth|idor|role|session/.test(t)) return 'Compare auth states or two objects/users with one differential request.'
    return 'Fingerprint route/input/oracle first; run one-variable diff before payload variants.'
  }
  if (category === 'pwn') return 'Confirm protection model and smallest primitive: leak, write, crash control, or win path before chain building.'
  if (category === 'crypto') return 'Extract parameters/oracle; test the cheapest known weakness matching size, nonce, seed, or algebraic structure.'
  if (category === 'reverse') return 'Slice validation/transform path; extract constants or build runtime oracle before full decompilation.'
  if (category === 'forensics') return 'Identify artifact layer and verify progress by extracting one file/stream/fragment before deeper carving.'
  if (category === 'misc') return 'Identify oracle/encoding/state model; automate the smallest solver or escape check instead of manual guessing.'
  return 'Turn the pattern into one safe observable check.'
}

function oracle(category, text) {
  const t = text.toLowerCase()
  if (/timing|time/.test(t)) return 'timing or latency change'
  if (/error|exception|trace/.test(t)) return 'error message or exception branch'
  if (/length|size/.test(t)) return 'length/size differential'
  if (/leak|read|dump/.test(t)) return 'leaked bytes/string/file'
  if (/crash|rip|segfault/.test(t)) return 'crash/control-flow state'
  if (/decrypt|plain|key/.test(t)) return 'key/plaintext recovery'
  if (/extract|carve|stream/.test(t)) return 'extracted artifact/stream'
  return category === 'web' ? 'status/body/header/state differential' : 'observable primitive evidence'
}

function stopRule() {
  return 'Stop after 2-3 same-family attempts without a new differential; return to experience gate.'
}

function pivotRule() {
  return 'Pivot if the first safe check does not match the expected oracle or a stronger category primitive appears.'
}

const cards = []
for (const file of walk(repo)) {
  const rel = path.relative(repo, file).replace(/\\/g, '/')
  const category = categoryFromRel(rel)
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  let current = 'top'
  let buf = []
  function flush() {
    const body = norm(buf.join(' '))
    if (!body || body.length < 60) return
    const title = norm(current)
    const combined = title + ' ' + body
    const card = {
      id: 'ljagiello:' + rel + '#' + cards.length,
      source: 'ljagiello/ctf-skills',
      source_file: rel,
      category,
      title,
      kind: kind(combined),
      trigger: norm((title + ' ' + body.slice(0, 300)).slice(0, 420)),
      first_safe_check: safeCheck(category, combined),
      oracle: oracle(category, combined),
      stop_rule: stopRule(),
      pivot_rule: pivotRule(category),
      keywords: Array.from(new Set((combined.toLowerCase().match(/[a-z0-9_+.#:-]{3,}/g) || []))).slice(0, 40),
      snippet: body.slice(0, 700),
    }
    cards.push(card)
  }
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.+)/)
    if (h) {
      flush()
      current = h[2]
      buf = []
    } else if (/^[-*]\s+|^\d+\.\s+|```|\b(Pattern|Key insight|When|If|Use|Check|Try|Exploit|Bypass|Oracle|Pivot|Workflow)\b/i.test(line)) {
      buf.push(line)
    }
  }
  flush()
}

const meta = { generated_at: new Date().toISOString(), source_repo: 'https://github.com/ljagiello/ctf-skills', cards: cards.length }
fs.writeFileSync(out, JSON.stringify({ meta, cards }, null, 2))
console.log('cards=' + cards.length)
console.log('out=' + out)
