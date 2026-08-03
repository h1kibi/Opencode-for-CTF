const fs = require('fs')
const idx = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/ljagiello-ctf-skills.cards.v5.json','utf8'))
const syn = JSON.parse(fs.readFileSync('C:/Users/Administrator/.config/opencode/knowledge/pattern-cards/synonyms.json','utf8'))
function terms(q){return Array.from(new Set(q.toLowerCase().split(/[^a-z0-9_+.#:-]+/).filter(x=>x.length>=2)))}
function expand(q){const ts=terms(q); const phrase=q.toLowerCase(); for(const [k,vs] of Object.entries(syn)){ if(phrase.includes(k)||terms(k).some(t=>ts.includes(t))){ for(const v of vs) ts.push(...terms(v)); ts.push(...terms(k)); } for(const v of vs){ if(phrase.includes(v)){ ts.push(...terms(k),...terms(v)); } } } return Array.from(new Set(ts))}
function score(card, q){const original=terms(q); const ex=expand(q); const hay=`${card.category} ${card.subfamily||''} ${card.kind} ${card.title} ${card.trigger} ${(card.keywords||[]).join(' ')} ${card.snippet||''} ${card.first_safe_check} ${card.oracle} ${card.source_file}`.toLowerCase(); let s=0; for(const t of ex){const exact=original.includes(t); const w=exact?1.6:0.7; if(card.category===t||card.kind===t||card.subfamily===t)s+=20*w; if((card.source_file||'').toLowerCase().includes(t))s+=10*w; if((card.title||'').toLowerCase().includes(t))s+=10*w; if((card.keywords||[]).includes(t))s+=7*w; const count=hay.split(t).length-1; s+=Math.min(count,8)*(t.length>=5?3:1)*w;} s+=(card.quality||3)*3+(card.specificity||3)*2+(card.rank_boost||0); if(card.curated)s+=35; if(card.distilled)s+=20; return Math.round(s)}
const cases=[
 ['web','server-parser-sink','file read include filter parser mismatch'],
 ['web','client-runtime','admin bot csp dom xss postmessage'],
 ['web','authz-state','idor object id role tenant owner'],
 ['web','url-fetcher','ssrf callback webhook url parser fetcher'],
 ['web','auth-token','jwt kid jku alg bearer cookie'],
 ['crypto','rsa','rsa small e broadcast coppersmith'],
 ['crypto','prng','nonce reuse prng lcg mt19937'],
 ['crypto','symmetric-mode','aes cbc padding oracle bitflip gcm nonce'],
 ['crypto','lattice','lll coppersmith hidden number lattice'],
 ['pwn','format-string','format string leak got overwrite relro'],
 ['pwn','heap','heap uaf tcache poisoning'],
 ['pwn','rop-shellcode','ret2libc rop syscall shellcode'],
 ['reverse','custom-vm','custom vm bytecode dispatch trace'],
 ['reverse','anti-analysis','anti debug ptrace timing packer'],
 ['reverse','validation-slice','validation constants z3 solver transform'],
 ['forensics','network','pcap dns covert timing tcp stream'],
 ['forensics','stego-media','image lsb bitplane spectrogram qr stego'],
 ['forensics','disk-memory','memory dump volatility registry docker layer'],
 ['misc','jail','pyjail no quotes object graph builtins'],
 ['misc','encoding','base64 hex xor rot unicode multi layer']
]
let ok=0
for(const [cat,sub,q] of cases){const hits=idx.cards.filter(c=>c.category===cat).map(c=>({c,s:score(c,q)})).sort((a,b)=>b.s-a.s).slice(0,5); const pass=hits.length&&hits.some(h=>h.c.category===cat&&(h.c.subfamily===sub||h.c.curated)); if(pass)ok++; console.log(`${pass?'PASS':'FAIL'} ${cat}/${sub} q=${q} top=${hits[0]?.c.id||'none'} topSub=${hits[0]?.c.subfamily||'none'} score=${hits[0]?.s||0}`)}
console.log(`summary ${ok}/${cases.length}`)
if(ok<cases.length) process.exit(1)
