const fs = require('fs')
const idx = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v8.json','utf8'))
const cases=[
 ['semantic-differential','validator sink split same input different consumer'],['network-fetch','resource locator fetcher internal callback'],['memory-primitive','binary exploitation primitive leak then write'],['crypto-parameter','recover key plaintext oracle cryptanalysis'],['reverse-modeling','lift validation slice custom vm solver'],['artifact-layering','recover stream layer hidden artifact'],['constraint-solving','model constrained input solver oracle']]
function score(c,q){const hay=`${(c.concepts||[]).join(' ')} ${(c.retrieval_intents||[]).join(' ')} ${(c.query_aliases||[]).join(' ')} ${(c.semantic_tokens||[]).join(' ')} ${c.title} ${c.trigger}`.toLowerCase(); return q.split(/\s+/).reduce((s,t)=>s+(hay.includes(t)?2:0),0)+(c.coverage_score||0)/3+(c.curation_priority||0)/10+(c.curation_tier==='curated'?4:c.curation_tier==='distilled'?3:0)}
let ok=0
for(const [concept,q] of cases){const hits=idx.cards.map(c=>({c,s:score(c,q)})).sort((a,b)=>b.s-a.s).slice(0,10); const pass=hits.some(h=>(h.c.concepts||[]).includes(concept)||(h.c.semantic_tokens||[]).includes(concept)); if(pass)ok++; console.log(`${pass?'PASS':'FAIL'} concept=${concept} top=${hits[0]?.c.id||'none'} tier=${hits[0]?.c.curation_tier||'?'} concepts=${(hits[0]?.c.concepts||[]).join('|')}`)}
console.log(`summary ${ok}/${cases.length}`)
if(ok<cases.length) process.exit(1)
