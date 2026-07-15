const fs = require('fs')
const idx = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v4.json','utf8'))
const syn = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/synonyms.json','utf8'))
function terms(q){return Array.from(new Set(q.toLowerCase().split(/[^a-z0-9_+.#:-]+/).filter(x=>x.length>=2)))}
function expand(q){const ts=terms(q); const phrase=q.toLowerCase(); for(const [k,vs] of Object.entries(syn)){ if(phrase.includes(k)||terms(k).some(t=>ts.includes(t))){ for(const v of vs) ts.push(...terms(v)); ts.push(...terms(k)); } for(const v of vs){ if(phrase.includes(v)){ ts.push(...terms(k),...terms(v)); } } } return Array.from(new Set(ts))}
function score(card, q){const original=terms(q); const ex=expand(q); const hay=`${card.category} ${card.kind} ${card.title} ${card.trigger} ${(card.keywords||[]).join(' ')} ${card.snippet||''} ${card.first_safe_check} ${card.oracle} ${card.source_file}`.toLowerCase(); let s=0; for(const t of ex){const exact=original.includes(t); const w=exact?1.6:0.7; if(card.category===t||card.kind===t)s+=20*w; if((card.source_file||'').toLowerCase().includes(t))s+=10*w; if((card.title||'').toLowerCase().includes(t))s+=10*w; if((card.keywords||[]).includes(t))s+=7*w; const count=hay.split(t).length-1; s+=Math.min(count,8)*(t.length>=5?3:1)*w;} s+=(card.quality||3)*3+(card.specificity||3)*2+(card.rank_boost||0); if(card.curated)s+=35; if(/workflow|pivot|technique/.test(card.kind))s+=4; return Math.round(s)}
const cases=[
  ['web','file read include filter parser mismatch'],
  ['web','admin bot csp dom xss postmessage'],
  ['web','idor object id role tenant owner'],
  ['crypto','rsa small e broadcast coppersmith'],
  ['crypto','nonce reuse prng lcg mt19937'],
  ['pwn','format string leak got overwrite relro'],
  ['pwn','heap uaf tcache poisoning'],
  ['reverse','custom vm bytecode dispatch trace'],
  ['forensics','pcap dns covert timing tcp stream'],
  ['misc','pyjail no quotes object graph builtins']
]
let ok=0
for(const [cat,q] of cases){const hits=idx.cards.filter(c=>c.category===cat).map(c=>({c,s:score(c,q)})).sort((a,b)=>b.s-a.s).slice(0,3); const pass=hits.length&&hits[0].s>0&&hits[0].c.category===cat; if(pass)ok++; console.log(`${pass?'PASS':'FAIL'} ${cat} q=${q} top=${hits[0]?.c.id||'none'} score=${hits[0]?.s||0}`)}
console.log(`summary ${ok}/${cases.length}`)
if(ok<cases.length) process.exit(1)
