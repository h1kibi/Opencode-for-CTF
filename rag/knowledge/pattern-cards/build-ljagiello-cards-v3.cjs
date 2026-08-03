const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v2.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v3.json')

function lower(card) { return `${card.category} ${card.kind} ${card.title} ${card.trigger} ${card.first_safe_check} ${card.keywords?.join(' ') || ''}`.toLowerCase() }

function nextTools(card) {
  const t = lower(card)
  const c = card.category
  if (c === 'web') {
    const tools = ['ctf-web-fingerprint', 'ctf-web-blackbox-map', 'ctf-decision-state']
    if (/js|spa|graphql|source.?map|bundle|client/.test(t)) tools.push('ctf-web-js-surface-map')
    if (/bot|dom|xss|csp|postmessage|browser/.test(t)) tools.push('ctf-web-runtime-map', 'ctf-web-reflection-map')
    if (/auth|idor|role|tenant|object|workflow|state/.test(t)) tools.push('ctf-web-state-machine-map', 'ctf-web-authz-matrix')
    if (/parser|content.?type|host|cache|url|upload|jwt|graphql/.test(t)) tools.push('ctf-web-template-check', 'ctf-web-diff-probe')
    if (/fuzz|wordlist|hidden route|param/.test(t)) tools.push('ctf-web-fuzz-plan')
    return Array.from(new Set(tools))
  }
  if (c === 'pwn') {
    const tools = ['ctf-binary-probe', 'ctf-decision-state']
    if (/format|string|heap|rop|overflow|shellcode|seccomp|kernel/.test(t)) tools.push('bash/gdb-or-pwntools')
    return tools
  }
  if (c === 'crypto') {
    const tools = ['ctf-decision-state']
    if (/rsa|modulus|prime|coppersmith|wiener|fermat|dp|dq/.test(t)) tools.push('ctf-rsa-probe')
    tools.push('python-or-sage-solver')
    return Array.from(new Set(tools))
  }
  if (c === 'reverse') return ['ctf-binary-probe', 'ctf-decision-state', /vm|bytecode|trace|dynamic|anti/.test(t) ? 'dynamic-trace-or-emulation' : 'static-slice-to-solver']
  if (c === 'forensics') {
    const tools = ['ctf-one-shot-triage', 'ctf-flag-grep']
    if (/pcap|tcp|dns|http|packet/.test(t)) tools.push('ctf-pcap-probe')
    if (/image|audio|stego|png|jpg|spectrogram|qr|media/.test(t)) tools.push('ctf-stego-probe')
    if (/archive|zip|tar|7z|extract/.test(t)) tools.push('ctf-safe-extract')
    return Array.from(new Set(tools))
  }
  if (c === 'misc') return ['ctf-one-shot-triage', 'ctf-decision-state', /z3|constraint|solver|game|vm/.test(t) ? 'python-z3-solver' : 'scripted-oracle-or-decoder']
  return ['ctf-decision-state']
}

function executionPlan(card) {
  const c = card.category
  if (c === 'web') return ['Build/refresh route-input-state-oracle model.', 'Run the card first_safe_check as one variable only.', 'Record response/runtime/authz differential.', 'Observe in ctf-decision-state and obey stop/pivot rule.']
  if (c === 'pwn') return ['Run binary triage and protection matrix.', 'Confirm the smallest primitive locally.', 'Stabilize leak/write/control before chain.', 'Only then build exploit script.']
  if (c === 'crypto') return ['Extract all parameters and samples.', 'Check card preconditions against sizes/oracle.', 'Write a minimal Python/Sage solver for the suspected weakness.', 'Verify plaintext/key/signature against oracle.']
  if (c === 'reverse') return ['Locate validation or dispatch slice.', 'Extract constants/state/trace for the selected card.', 'Lift only relevant logic to solver/emulator.', 'Validate on known inputs before full solve.']
  if (c === 'forensics') return ['Identify artifact layer and safe extraction path.', 'Apply the selected probe to recover one new layer/stream/fragment.', 'Flag-grep new outputs.', 'Pivot category if recovered artifact changes domain.']
  if (c === 'misc') return ['Model oracle/state/constraints.', 'Automate the smallest reversible step or escape capability.', 'Verify progress by new layer/capability/accepted answer.', 'Stop manual guessing after no structural improvement.']
  return ['Run one first_safe_check and observe.']
}

function failureModes(card) {
  const c = card.category
  if (c === 'web') return ['payload storm before oracle calibration', 'environment enumeration without differential', 'generic webfetch/curl replacing model-building']
  if (c === 'pwn') return ['ROP before leak/control primitive', 'wrong libc/protections assumption', 'unstable exploit state']
  if (c === 'crypto') return ['bruteforce without parameter evidence', 'using attack outside preconditions', 'ignoring encoding/padding layer']
  if (c === 'reverse') return ['decompiling unrelated code', 'missing runtime oracle', 'treating crypto/VM as plain string compare']
  if (c === 'forensics') return ['deep stego before cheap triage', 'unsafe extraction', 'missing embedded/trailing data']
  if (c === 'misc') return ['manual guessing instead of solver/oracle model', 'using payload catalog without capability match']
  return ['continuing without new differential']
}

function rankBoost(card) {
  let b = 0
  if (card.curated) b += 25
  const t = lower(card)
  if (/first|primitive|oracle|pivot|workflow|mismatch|triage|matrix/.test(t)) b += 8
  if (/writeup|challenge title/.test(t)) b -= 10
  return b
}

const idx = JSON.parse(fs.readFileSync(input, 'utf8'))
const cards = idx.cards.map((card) => ({
  ...card,
  next_tools: nextTools(card),
  execution_plan: executionPlan(card),
  failure_modes: failureModes(card),
  rank_boost: rankBoost(card),
  index_version: 3,
}))
const meta = { ...idx.meta, version: 3, generated_at: new Date().toISOString(), cards: cards.length, v3_features: ['next_tools', 'execution_plan', 'failure_modes', 'rank_boost'] }
fs.writeFileSync(output, JSON.stringify({ meta, cards }, null, 2))
console.log('v3_cards=' + cards.length)
console.log('out=' + output)
