const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v8.json')
const candidatesPath = path.join(base, 'curation-candidates.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v9.json')
function words(s){return String(s||'').toLowerCase().split(/[^a-z0-9_+.#:-]+/).filter(x=>x.length>=2)}
function ngrams(tokens,n){const out=[]; for(let i=0;i+n<=tokens.length;i++) out.push(tokens.slice(i,i+n).join(' ')); return out}
function phrases(c){const parts=[c.title,c.trigger,c.first_safe_check,c.oracle,c.probe_template,...(c.query_aliases||[])]; return parts.flatMap(p=>{const w=words(p).filter(x=>x.length>=3).slice(0,16); return [...ngrams(w,2),...ngrams(w,3)]}).slice(0,80)}
const idx=JSON.parse(fs.readFileSync(input,'utf8'))
const cand=JSON.parse(fs.readFileSync(candidatesPath,'utf8')).candidates||[]
const candIds=new Set(cand.map(c=>c.id))
const cards=idx.cards.map(c=>{const semi=candIds.has(c.id); const semantic_ngrams=phrases(c); const evidence_phrases=Array.from(new Set([...(c.query_aliases||[]),...(c.concepts||[]),...(c.retrieval_intents||[]),...(c.subfamilies||[]),...semantic_ngrams.slice(0,18)])).slice(0,60); return {...c, semi_curated:semi, semantic_ngrams, evidence_phrases, curation_tier:c.curated?'curated':semi?'semi-curated':c.curation_tier, rank_boost:(c.rank_boost||0)+(semi?22:0), index_version:9}})
const meta={...idx.meta, version:9, generated_at:new Date().toISOString(), cards:cards.length, semi_curated_cards:cards.filter(c=>c.semi_curated).length, v9_features:['semi_curated_candidates_integrated','semantic_ngrams','evidence_phrases']}
fs.writeFileSync(output,JSON.stringify({meta,cards},null,2))
console.log('v9_cards='+cards.length); console.log('semi_curated='+meta.semi_curated_cards); console.log('out='+output)
