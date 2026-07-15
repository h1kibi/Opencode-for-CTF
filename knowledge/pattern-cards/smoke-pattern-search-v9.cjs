const fs = require('fs')
const idx = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v9.json','utf8'))
const cases=[
 ['validator sink split','semantic-differential'],['same input dangerous consumer','semantic-differential'],['callback internal fetcher','network-fetch'],['leak then write primitive','memory-primitive'],['recover key plaintext oracle','crypto-parameter'],['lift validation to solver','reverse-modeling'],['hidden artifact stream layer','artifact-layering'],['model constrained input','constraint-solving'],['token trust boundary','auth-boundary'],['browser storage csp','browser-runtime']]
function score(c,q){const hay=`${(c.semantic_tokens||[]).join(' ')} ${(c.evidence_phrases||[]).join(' ')} ${(c.query_aliases||[]).join(' ')} ${(c.concepts||[]).join(' ')} ${c.title} ${c.trigger}`.toLowerCase(); return q.split(/\s+/).reduce((s,t)=>s+(hay.includes(t)?2:0),0)+(c.semi_curated?2:0)+(c.curated?4:0)+(c.curation_priority||0)/12}
let ok=0
for(const [q,concept] of cases){const hits=idx.cards.map(c=>({c,s:score(c,q)})).sort((a,b)=>b.s-a.s).slice(0,10); const pass=hits.some(h=>(h.c.concepts||[]).includes(concept)||(h.c.semantic_tokens||[]).includes(concept)); if(pass)ok++; console.log(`${pass?'PASS':'FAIL'} q=${q} concept=${concept} top=${hits[0]?.c.id||'none'} tier=${hits[0]?.c.curation_tier||'?'} semi=${hits[0]?.c.semi_curated?'yes':'no'}`)}
console.log(`summary ${ok}/${cases.length}`)
if(ok<cases.length) process.exit(1)
