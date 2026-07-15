const fs = require('fs')
const idx = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v7.json','utf8'))
const cases=[
 ['semantic-differential','safe validator dangerous consumer different interpretation'],['oracle-calibration','need observable error length timing leak status'],['auth-boundary','role tenant session object permission boundary'],['browser-runtime','browser storage postmessage csp bot runtime'],['file-primitive','path traversal file read upload archive include'],['network-fetch','internal service webhook fetch url redirect metadata'],['memory-primitive','control rip leak canary libc arbitrary write'],['crypto-parameter','nonce seed modulus signature padding oracle'],['reverse-modeling','validation constants bytecode vm trace solver'],['artifact-layering','embedded file metadata pcap stego disk layer'],['constraint-solving','z3 constraints game oracle decode jail']]
function score(card,q){const hay=`${(card.concepts||[]).join(' ')} ${(card.retrieval_intents||[]).join(' ')} ${(card.query_aliases||[]).join(' ')} ${card.title} ${card.trigger}`.toLowerCase(); return q.toLowerCase().split(/\s+/).reduce((s,t)=>s+(hay.includes(t)?1:0),0)+(card.coverage_score||0)/4+(card.distilled?2:0)}
let ok=0
for(const [concept,q] of cases){const hits=idx.cards.map(c=>({c,s:score(c,q)})).sort((a,b)=>b.s-a.s).slice(0,8); const pass=hits.some(h=>(h.c.concepts||[]).includes(concept)); if(pass)ok++; console.log(`${pass?'PASS':'FAIL'} concept=${concept} top=${hits[0]?.c.id||'none'} concepts=${(hits[0]?.c.concepts||[]).join('|')}`)}
console.log(`summary ${ok}/${cases.length}`)
if(ok<cases.length) process.exit(1)
