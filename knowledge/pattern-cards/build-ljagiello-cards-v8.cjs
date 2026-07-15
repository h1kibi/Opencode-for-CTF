const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v7.json')
const synonyms = path.join(base, 'synonyms.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v8.json')
const candidatesOut = path.join(base, 'curation-candidates.json')
const syn = JSON.parse(fs.readFileSync(synonyms, 'utf8'))
function terms(s){return Array.from(new Set(String(s||'').toLowerCase().split(/[^a-z0-9_+.#:-]+/).filter(x=>x.length>=2)))}
function semanticTokens(c){const raw=[c.category,c.primary_subfamily,...(c.subfamilies||[]),...(c.concepts||[]),...(c.retrieval_intents||[]),...(c.query_aliases||[]),c.title,c.source_file,...(c.keywords||[])].join(' '); const ts=terms(raw); for(const [k,vs] of Object.entries(syn)){const kt=terms(k); if(kt.some(t=>ts.includes(t))||String(raw).toLowerCase().includes(k)){ts.push(...kt); for(const v of vs) ts.push(...terms(v));} for(const v of vs){const vt=terms(v); if(vt.some(t=>ts.includes(t))){ts.push(...kt,...vt)}}} return Array.from(new Set(ts)).slice(0,160)}
function tier(c){if(c.curated)return 'curated'; if(c.distilled)return 'distilled'; if((c.curation_priority||0)>=28)return 'high-priority'; if(c.promoted)return 'promoted'; return 'auto'}
function review(c){const t=tier(c); if(t==='curated')return 'keep; use feedback to tighten preconditions'; if(t==='distilled')return 'consider promoting to curated after one confirmed or led_to_flag feedback'; if(t==='high-priority')return 'review source and convert to curated if trigger/probe/oracle are clear'; if(t==='promoted')return 'watch feedback; promote only with strong oracle'; return 'use only if no better card matches'}
const idx=JSON.parse(fs.readFileSync(input,'utf8'))
const cards=idx.cards.map(c=>{const sem=semanticTokens(c); const ct=tier(c); return {...c, semantic_tokens:sem, curation_tier:ct, review_recommendation:review(c), index_version:8, rank_boost:(c.rank_boost||0)+(ct==='curated'?35:ct==='distilled'?25:ct==='high-priority'?15:ct==='promoted'?8:0)}})
const candidates=cards.filter(c=>!c.curated&&(c.curation_tier==='distilled'||c.curation_tier==='high-priority')).sort((a,b)=>(b.curation_priority||0)-(a.curation_priority||0)).slice(0,220).map(c=>({id:c.id, category:c.category, tier:c.curation_tier, priority:c.curation_priority, title:c.title, source_file:c.source_file, primary_subfamily:c.primary_subfamily, subfamilies:c.subfamilies, concepts:c.concepts, trigger:c.trigger, first_safe_check:c.first_safe_check, oracle:c.oracle, review_recommendation:c.review_recommendation}))
const meta={...idx.meta, version:8, generated_at:new Date().toISOString(), cards:cards.length, semantic_token_cards:cards.filter(c=>(c.semantic_tokens||[]).length>0).length, curation_candidates:candidates.length, v8_features:['semantic_tokens','curation_tier','review_recommendation','curation_candidates_export']}
fs.writeFileSync(output,JSON.stringify({meta,cards},null,2))
fs.writeFileSync(candidatesOut,JSON.stringify({meta:{generated_at:meta.generated_at,total:candidates.length,source:'v8 high-value non-curated cards'},candidates},null,2))
console.log('v8_cards='+cards.length); console.log('candidates='+candidates.length); console.log('out='+output)
