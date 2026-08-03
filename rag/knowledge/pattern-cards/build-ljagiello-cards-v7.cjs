const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v6.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v7.json')
const conceptRules = [
 ['semantic-differential',/precheck|validator|sanitizer|filter|sink|parser|mismatch|normalization|canonical|differential/],
 ['oracle-calibration',/oracle|error|timing|length|status|leak|crash|callback|hit|differential/],
 ['auth-boundary',/auth|jwt|cookie|session|role|tenant|owner|idor|oauth|saml|permission/],
 ['browser-runtime',/xss|dom|csp|bot|postmessage|browser|storage|script/],
 ['file-primitive',/file|path|lfi|upload|archive|write|read|include|traversal/],
 ['network-fetch',/ssrf|url|webhook|callback|fetch|redirect|dns|metadata|host/],
 ['memory-primitive',/overflow|uaf|heap|format|rop|leak|write|rip|canary|libc/],
 ['crypto-parameter',/rsa|aes|ecc|lattice|nonce|iv|seed|prng|hash|mac|signature|oracle/],
 ['reverse-modeling',/reverse|validation|vm|bytecode|opcode|trace|z3|solver|anti-debug|constant/],
 ['artifact-layering',/forensics|pcap|disk|memory|stego|metadata|binwalk|extract|carve|stream/],
 ['constraint-solving',/z3|constraint|solver|game|state|oracle|encoding|jail|sandbox|decode/]
]
function text(c){return `${c.category} ${c.primary_subfamily||''} ${(c.subfamilies||[]).join(' ')} ${c.kind} ${c.title} ${c.trigger} ${c.first_safe_check} ${c.oracle} ${c.source_file} ${(c.keywords||[]).join(' ')}`.toLowerCase()}
function concepts(c){const t=text(c); const out=[]; for(const [name,re] of conceptRules) if(re.test(t)) out.push(name); return out.length?out:['general-ctf-pattern']}
function intents(c){const cs=concepts(c), sub=c.primary_subfamily||c.subfamily||c.category; const arr=['pattern-recall']; if(cs.includes('semantic-differential'))arr.push('find-mismatch'); if(cs.includes('oracle-calibration'))arr.push('calibrate-oracle'); if(cs.includes('auth-boundary'))arr.push('test-authz'); if(cs.includes('memory-primitive'))arr.push('prove-memory-primitive'); if(cs.includes('crypto-parameter'))arr.push('test-crypto-weakness'); if(cs.includes('artifact-layering'))arr.push('peel-artifact-layer'); if(cs.includes('constraint-solving'))arr.push('model-solver-oracle'); arr.push(`subfamily:${sub}`); return Array.from(new Set(arr))}
function aliases(c){const t=text(c); const a=[]; if(/precheck|sink|mismatch|parser/.test(t))a.push('same input different parser','validator sink split','semantic mismatch','filter bypass by parser difference'); if(/ssrf|url|fetch/.test(t))a.push('url parser confusion','fetcher mismatch','internal fetch','callback webhook abuse'); if(/jwt|oauth|session/.test(t))a.push('token forgery','session confusion','auth trust boundary'); if(/heap|format|rop/.test(t))a.push('binary exploitation primitive','leak then write','control flow primitive'); if(/rsa|nonce|prng|aes|lattice/.test(t))a.push('crypto parameter triage','recover key or plaintext','oracle cryptanalysis'); if(/vm|bytecode|validation/.test(t))a.push('reverse validation slice','custom vm trace','lift to solver'); if(/pcap|stego|forensics/.test(t))a.push('extract hidden artifact','recover stream or layer','forensic triage'); if(/jail|encoding|z3/.test(t))a.push('model constrained input','decode pipeline','escape capability model'); return Array.from(new Set(a)).slice(0,10)}
function coverage(c){let s=0; if(c.curated)s+=4; if(c.promoted)s+=2; if(c.distilled)s+=3; s+=Math.min(3,(c.subfamilies||[]).length); s+=Math.min(3,concepts(c).length); if(c.probe_template)s+=2; if((c.next_tools||[]).length)s+=2; return Math.min(15,s)}
function priority(c){let p=coverage(c)+(c.quality||0)+(c.specificity||0); if(c.curated)p+=8; if(c.distilled)p+=5; if(/field-notes|advanced|patterns|rsa|heap|format|string|auth|server-side|client-side|network|pyjail/.test(c.source_file||''))p+=3; return Math.min(40,p)}
const idx=JSON.parse(fs.readFileSync(input,'utf8'))
const cards=idx.cards.map(c=>{const cs=concepts(c); return {...c, concepts:cs, retrieval_intents:intents(c), query_aliases:aliases(c), coverage_score:coverage(c), curation_priority:priority(c), index_version:7, rank_boost:(c.rank_boost||0)+Math.round(priority(c)/4)}})
const meta={...idx.meta, version:7, generated_at:new Date().toISOString(), cards:cards.length, concept_groups:conceptRules.length, high_curation_priority:cards.filter(c=>c.curation_priority>=28).length, v7_features:['concepts','retrieval_intents','query_aliases','coverage_score','curation_priority']}
fs.writeFileSync(output,JSON.stringify({meta,cards},null,2))
console.log('v7_cards='+cards.length); console.log('high_priority='+meta.high_curation_priority); console.log('out='+output)
