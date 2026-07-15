const fs = require('fs')
const path = require('path')
const base = 'C:/Users/Administrator/.config/opencode/knowledge/pattern-cards'
const input = path.join(base, 'ljagiello-ctf-skills.cards.v4.json')
const output = path.join(base, 'ljagiello-ctf-skills.cards.v5.json')
function txt(c){return `${c.category} ${c.kind} ${c.title} ${c.trigger} ${c.first_safe_check} ${c.oracle} ${c.source_file} ${(c.keywords||[]).join(' ')}`.toLowerCase()}
function subfamily(c){const t=txt(c), cat=c.category; if(cat==='web'){ if(/jwt|jws|jwe|oauth|saml|cookie|session/.test(t))return 'auth-token'; if(/idor|tenant|role|owner|object/.test(t))return 'authz-state'; if(/xss|dom|csp|postmessage|bot/.test(t))return 'client-runtime'; if(/ssrf|url|webhook|callback|fetch/.test(t))return 'url-fetcher'; if(/upload|file write|archive/.test(t))return 'upload-storage'; if(/template|ssti|render|include|lfi|path|wrapper|parser|mismatch/.test(t))return 'server-parser-sink'; return 'web-general'} if(cat==='pwn'){ if(/format/.test(t))return 'format-string'; if(/heap|uaf|tcache|fastbin|unsorted|fsop/.test(t))return 'heap'; if(/rop|ret2|srop|shellcode|syscall/.test(t))return 'rop-shellcode'; if(/kernel|seccomp|sandbox/.test(t))return 'kernel-sandbox'; return 'pwn-general'} if(cat==='crypto'){ if(/rsa|modulus|prime|coppersmith|wiener|fermat/.test(t))return 'rsa'; if(/aes|cbc|ecb|gcm|padding|nonce|iv/.test(t))return 'symmetric-mode'; if(/prng|lcg|mt19937|lfsr|seed|xorshift/.test(t))return 'prng'; if(/ecc|ecdsa|curve|subgroup/.test(t))return 'ecc'; if(/lattice|lll|bkz|hnp|lwe|coppersmith/.test(t))return 'lattice'; return 'crypto-general'} if(cat==='reverse'){ if(/vm|bytecode|opcode|dispatch/.test(t))return 'custom-vm'; if(/anti|debug|packer|timing|ptrace/.test(t))return 'anti-analysis'; if(/android|apk|wasm|go|rust|python|java|\.net|language/.test(t))return 'language-platform'; return 'validation-slice'} if(cat==='forensics'){ if(/pcap|tcp|dns|http|packet/.test(t))return 'network'; if(/disk|memory|volatility|registry|docker|deleted/.test(t))return 'disk-memory'; if(/stego|image|audio|spectrogram|qr|barcode|video/.test(t))return 'stego-media'; return 'artifact-triage'} if(cat==='misc'){ if(/pyjail|bashjail|sandbox|restricted/.test(t))return 'jail'; if(/encoding|base|hex|rot|xor|unicode|qr/.test(t))return 'encoding'; if(/game|vm|z3|constraint|solver/.test(t))return 'constraint-game-vm'; if(/dns|rf|sdr/.test(t))return 'protocol-signal'; return 'misc-general'} return 'general'}
function probeTemplate(c){const sf=subfamily(c); const map={
 'server-parser-sink':'Build precheck/sink equation; run one harmless parser/path/wrapper differential; observe sink reachability.',
 'url-fetcher':'Compare one URL parser variant at a time; observe redirect/fetch/DNS/error oracle.',
 'authz-state':'Run two-session/object matrix on one read endpoint; then one guarded transition if justified.',
 'client-runtime':'Map reflection/runtime/CSP/storage; trigger one harmless bot/browser canary.',
 'upload-storage':'Upload one harmless canary; map storage/serve/reload behavior before bypass variants.',
 'auth-token':'Decode/classify token/cookie; test one alg/key/role/state differential without brute force.',
 'format-string':'Find offset and leak with read-only specifiers before write.',
 'heap':'Map alloc/free/edit/show state; prove leak/overlap/double-free/write primitive before gadget.',
 'rop-shellcode':'Confirm control-flow and leak/protection state before chain.',
 'kernel-sandbox':'Enumerate allowed syscalls/objects and prove one sandbox/kernel primitive.',
 'rsa':'Run RSA triage: size, gcd, small e, close primes, leaked CRT, Coppersmith indicators.',
 'symmetric-mode':'Classify mode/oracle; test one block/nonce/padding/bitflip differential.',
 'prng':'Collect outputs; test seed/state recovery or next-output prediction.',
 'ecc':'Check order/subgroup/nonce/invalid-curve evidence before algebra.',
 'lattice':'Write equations, dimensions, bounds; test LLL/CVP only when leakage fits.',
 'custom-vm':'Identify dispatch, opcode format, state registers; trace one known input.',
 'anti-analysis':'Bypass/dump/trace minimal protected region; avoid full unpack first.',
 'validation-slice':'Slice validation path; lift constants/transforms to solver.',
 'network':'Extract protocols/streams/objects first; then covert/timing channels.',
 'disk-memory':'Run artifact triage; extract one process/file/registry/layer clue.',
 'stego-media':'Check metadata/signature/trailing data/bitplanes/spectrogram before brute stego.',
 'jail':'Model allowed syntax/builtins/object graph; prove one capability escalation.',
 'encoding':'Build reversible pipeline; require structure improvement per layer.',
 'constraint-game-vm':'Model state/oracle; use z3/DP/search instead of manual play.',
 'protocol-signal':'Identify modulation/protocol fields; decode one frame/query before deeper analysis.'
}; return map[sf]||c.first_safe_check}
function signals(c){const t=txt(c); const arr=[]; for(const k of ['precheck','sink','parser','wrapper','include','ssrf','url','xss','bot','jwt','idor','format','heap','rsa','nonce','prng','vm','pcap','stego','pyjail','encoding']) if(t.includes(k)) arr.push(k); return arr.slice(0,12)}
function distilled(c){return !!(c.curated || (c.promoted && (c.quality||0)>=6 && (c.specificity||0)>=5 && /technique|workflow|pivot/.test(c.kind)))}
const idx=JSON.parse(fs.readFileSync(input,'utf8'))
const cards=idx.cards.map(c=>{const sf=subfamily(c); const dis=distilled(c); return {...c, subfamily:sf, precondition_signals:signals(c), probe_template:probeTemplate(c), distilled:dis, rank_boost:(c.rank_boost||0)+(dis?18:0), index_version:5}})
const meta={...idx.meta, version:5, generated_at:new Date().toISOString(), cards:cards.length, distilled_cards:cards.filter(c=>c.distilled).length, v5_features:['subfamily','precondition_signals','probe_template','distilled_cards']}
fs.writeFileSync(output,JSON.stringify({meta,cards},null,2))
console.log('v5_cards='+cards.length); console.log('distilled='+meta.distilled_cards); console.log('out='+output)
