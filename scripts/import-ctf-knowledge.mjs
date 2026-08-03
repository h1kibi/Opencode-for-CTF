import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_ID = "des-ctf-knowledge"
const DEFAULT_SOURCE = path.join(ROOT, "rag", "Des-CTF-Knowledge")
const UPSTREAM = "https://github.com/Dest1ny-Sec/Des-CTF-Knowledge.git"
const LICENSE_NOTE =
  "Compilation is MIT; individual collected articles, writeups, and scripts may have separate authors and licenses."

const TOPICS = [
  [
    "web-sqli",
    "web",
    "SQL injection evidence routing",
    ["sql", "sqli", "union", "blind", "error-based", "waf"],
    "SQL.idx.md",
    "Classify reflection, error, boolean, or timing oracle before selecting one minimally destructive SQL probe.",
  ],
  [
    "web-rce",
    "web",
    "Command execution oracle routing",
    ["rce", "command", "exec", "shell", "dnslog", "no-output"],
    "命令执行.idx.md",
    "Establish whether output, timing, DNS, or file side effects provide the safest command-execution oracle.",
  ],
  [
    "web-upload",
    "web",
    "Upload validation and parsing split",
    ["upload", "mime", "extension", "parser", "webshell"],
    "文件上传漏洞.idx.md",
    "Compare client, MIME, extension, storage, and server parsing behavior with a harmless marker file before payload escalation.",
  ],
  [
    "web-lfi",
    "web",
    "File inclusion and wrapper classification",
    ["lfi", "include", "php-filter", "wrapper", "path"],
    "文件包含.idx.md",
    "Confirm controllable path resolution and wrapper handling with a benign readable resource before attempting closure.",
  ],
  [
    "web-ssrf",
    "web",
    "SSRF transport and reachability oracle",
    ["ssrf", "gopher", "redis", "fastcgi", "internal", "dns-rebinding"],
    "SSRF漏洞.idx.md",
    "Use one controlled destination to distinguish URL parsing, DNS resolution, protocol filtering, and response visibility.",
  ],
  [
    "web-deserialization",
    "web",
    "PHP deserialization precondition gate",
    ["php", "deserialization", "pop-chain", "phar", "wakeup", "magic-method"],
    "PHP反序列化漏洞总结.idx.md",
    "Prove attacker-controlled deserialization and reachable magic methods before constructing a gadget chain.",
  ],
  [
    "web-ssti",
    "web",
    "SSTI engine and expression differential",
    ["ssti", "jinja2", "template", "expression", "sandbox"],
    "SSTI.md",
    "Use harmless arithmetic and syntax differentials to identify the template engine before deeper object traversal.",
  ],
  [
    "web-jwt",
    "web",
    "JWT trust-boundary classification",
    ["jwt", "kid", "jku", "hs256", "rs256", "algorithm"],
    "JWT.idx.md",
    "Compare accepted algorithms, key selection inputs, and claim validation with a non-privileged token mutation.",
  ],
  [
    "web-php-audit",
    "web",
    "PHP weak-type and input-flow audit",
    ["php", "audit", "weak-type", "preg-match", "extract", "strcmp"],
    "php代码审计.idx.md",
    "Trace one attacker-controlled value through normalization and comparison to the first security-sensitive branch.",
  ],
  [
    "web-xss",
    "web",
    "XSS sink and browser-behavior routing",
    ["xss", "html", "attribute", "dom", "event-handler", "filter-bypass"],
    "XSS跨站脚本攻击.md",
    "Separate reflected, stored, DOM, and browser-context behavior with a harmless marker before attempting escalation.",
  ],
  [
    "web-xxe",
    "web",
    "XXE parser and entity-resolution gate",
    ["xxe", "xml", "entity", "doctype", "oob", "parser"],
    "XXE漏洞总结.idx.md",
    "Verify controllable XML parsing and safe entity expansion behavior before attempting file, SSRF, or OOB closure.",
  ],
  [
    "web-jsonp",
    "web",
    "JSONP callback and trust-boundary routing",
    ["jsonp", "callback", "cors", "script-src", "cross-domain"],
    "JSONP劫持漏洞.md",
    "Confirm whether callback control changes executable script output or only data formatting before broader origin-trust assumptions.",
  ],
  [
    "web-csrf",
    "web",
    "CSRF token and state-change routing",
    ["csrf", "token", "same-site", "state-change", "origin", "referer"],
    "CSRF.md",
    "Identify whether the route depends on cookies alone, anti-CSRF tokens, or origin checks with one non-destructive state-change attempt.",
  ],
  [
    "web-java-deserialization",
    "web",
    "Java deserialization and gadget reachability",
    ["java", "deserialization", "readobject", "gadget", "commons-collections", "fastjson"],
    "Java反序列化漏洞总结.idx.md",
    "Prove attacker-controlled object input and reachable gadget execution primitives before selecting a chain family.",
  ],
  [
    "web-java-rce",
    "web",
    "Java web expression and template execution",
    ["java", "spel", "ognl", "el", "freemarker", "velocity"],
    "Java代码审计.idx.md",
    "Use harmless expression or template differentials to classify the Java execution surface before object or command escalation.",
  ],
  [
    "web-serialization-logic",
    "web",
    "Cross-stack serialization trust routing",
    ["serialization", "object", "pickle", "yaml", "fastjson", "jackson"],
    "序列化和反序列化漏洞.md",
    "Test whether untrusted structured input crosses a serialization boundary with one minimal object-shape differential.",
  ],
  [
    "web-smuggling",
    "web",
    "HTTP request smuggling and parser differential",
    ["request smuggling", "desync", "cl.te", "te.cl", "hop-by-hop", "front-end back-end"],
    "HTTP走私.md",
    "Use one harmless differential request to classify front-end versus back-end parsing disagreement before any queue-poisoning escalation.",
  ],
  [
    "web-cache",
    "web",
    "Cache, CDN, and proxy trust routing",
    ["cache", "cdn", "proxy", "x-forwarded-host", "poisoning", "vary"],
    "缓存投毒.md",
    "Compare cache key behavior, header trust, and reflection persistence with one non-destructive marker response before broader poisoning attempts.",
  ],
  [
    "web-graphql",
    "web",
    "GraphQL schema and authorization routing",
    ["graphql", "introspection", "resolver", "authz", "batching", "idor"],
    "GraphQL安全.md",
    "Classify whether introspection, resolver exposure, batching, or authz gaps provide the safest first GraphQL differential.",
  ],
  [
    "web-prototype-pollution",
    "web",
    "Prototype pollution and object-merge routing",
    ["prototype pollution", "__proto__", "constructor", "merge", "node", "express"],
    "原型链污染.md",
    "Confirm controllable object merge behavior with a harmless property differential before sink hunting or gadget escalation.",
  ],
  [
    "web-websocket-sse",
    "web",
    "WebSocket and SSE session-boundary routing",
    ["websocket", "sse", "socket.io", "channel", "authz", "eventstream"],
    "WebSocket安全.md",
    "Check handshake trust, channel naming, and state transitions with one low-impact subscription or event differential before message forgery.",
  ],
  [
    "web-nosql-search",
    "web",
    "NoSQL and search-query trust routing",
    ["nosql", "mongodb", "elasticsearch", "search", "regex", "aggregation"],
    "NoSQL注入.md",
    "Use one constrained search/filter differential to separate parser quirks, regex behavior, and auth-scoped search exposure before payload variation.",
  ],
  [
    "web-cors-postmessage",
    "web",
    "Cross-origin messaging and browser trust routing",
    ["cors", "postmessage", "origin", "iframe", "trusted origin", "targetorigin"],
    "跨域通信安全.md",
    "Verify origin checks, wildcard trust, and message handling with one benign cross-origin marker before privilege assumptions.",
  ],
  [
    "web-oauth-jwk",
    "web",
    "OAuth, JWK, and token-key selection routing",
    ["oauth", "jwk", "jku", "kid", "jwks", "openid"],
    "OAuth与JWK.md",
    "Classify whether token verification depends on remote key fetch, kid selection, or issuer trust with one non-privileged token differential.",
  ],
  [
    "web-race-toctou",
    "web",
    "Race condition and state-transition routing",
    ["race", "toctou", "parallel", "double-spend", "retry", "window"],
    "竞争条件.md",
    "Test one bounded concurrent action pair to determine whether timing, stale state, or retry windows expose the real race surface.",
  ],
  [
    "web-cloud-metadata",
    "web",
    "Cloud metadata and CI trust-boundary routing",
    ["metadata", "iam", "ecs", "ci", "runner", "instance"],
    "云环境安全.md",
    "Confirm whether the first reachable trust surface is metadata, CI variables, runner secrets, or proxy headers before SSRF-style escalation.",
  ],
  [
    "crypto-rsa-routing",
    "crypto",
    "RSA attack-surface classification",
    ["rsa", "small e", "common modulus", "broadcast", "dp leak", "crt"],
    "RSA密码学.md",
    "Determine whether the first exploitable RSA surface is padding, modulus reuse, leaked CRT material, or exponent misuse before solving.",
  ],
  [
    "crypto-padding-oracle",
    "crypto",
    "CBC padding-oracle routing",
    ["padding oracle", "cbc", "oracle", "iv", "decrypt error", "pkcs7"],
    "PaddingOracle.md",
    "Probe one ciphertext/IV differential to separate padding feedback, MAC feedback, and silent rejection before adaptive decryption.",
  ],
  [
    "crypto-xor-keystream",
    "crypto",
    "XOR and keystream-reuse routing",
    ["xor", "repeating key", "keystream", "stream cipher", "crib", "nonce reuse"],
    "XOR与流密码.md",
    "Classify fixed-key XOR, repeating-key XOR, and keystream reuse with one structure-preserving differential before brute force.",
  ],
  [
    "crypto-hash-mac",
    "crypto",
    "Hash, MAC, and length-extension routing",
    ["length extension", "mac", "sha1", "md5", "hmac", "token"],
    "Hash与MAC.md",
    "Test whether integrity depends on raw hash concatenation, keyed MAC, or HMAC before attempting token forgery.",
  ],
  [
    "crypto-prng-nonce",
    "crypto",
    "PRNG and nonce-generation routing",
    ["prng", "nonce", "seed", "mt19937", "predictable", "reuse"],
    "随机数与Nonce.md",
    "Check for nonce reuse, timestamp seeding, or observable PRNG state before algebraic reconstruction.",
  ],
  [
    "crypto-ecc-dlog",
    "crypto",
    "Elliptic-curve and discrete-log routing",
    ["ecc", "ecdh", "ecdsa", "curve", "discrete log", "invalid curve"],
    "ECC与离散对数.md",
    "Identify whether the weakness is signature nonce reuse, invalid-curve handling, or discrete-log structure before deeper math work.",
  ],
  [
    "crypto-lattice-routing",
    "crypto",
    "Lattice and hidden-number routing",
    ["lattice", "lll", "knapsack", "hidden number", "approximate gcd", "small root"],
    "Lattice与HNP.md",
    "Determine whether the evidence suggests a lattice, hidden-number, approximate-GCD, or subset-sum family before solver selection.",
  ],
  [
    "crypto-encoding-vs-crypto",
    "crypto",
    "Encoding-versus-cryptography classification",
    ["base64", "hex", "rot", "encoding", "substitution", "not crypto"],
    "编码还是密码.md",
    "Separate pure representation transforms from real cryptographic structure with one reversible normalization pass before solver escalation.",
  ],
  [
    "forensics-image",
    "forensics",
    "Image container and stego layer routing",
    ["image", "stego", "png", "crc", "lsb", "metadata"],
    "图片隐写.idx.md",
    "Validate container structure, dimensions, trailing data, metadata, and channel anomalies before brute force.",
  ],
  [
    "forensics-archive",
    "forensics",
    "Archive integrity and encryption classification",
    ["archive", "zip", "rar", "crc", "known-plaintext", "encryption"],
    "压缩包总结.idx.md",
    "Inventory members and distinguish corruption, pseudo-encryption, weak encryption, and nested archives before cracking.",
  ],
  [
    "forensics-traffic",
    "forensics",
    "Traffic artifact and protocol extraction routing",
    ["pcap", "traffic", "http", "dns", "credential", "stream"],
    "流量分析.md",
    "Classify the dominant protocol, reconstruction target, and credential-bearing artifacts before deep carving or brute-force decoding.",
  ],
  [
    "forensics-disk",
    "forensics",
    "Disk-image partition and filesystem routing",
    ["disk", "filesystem", "partition", "mft", "deleted", "mount"],
    "磁盘文件分析.md",
    "Confirm partition layout, filesystem type, and deleted-artifact recovery surface before broad extraction passes.",
  ],
  [
    "forensics-memory",
    "forensics",
    "Memory artifact and process-surface routing",
    ["memory", "dump", "process", "credential", "network", "volatility"],
    "内存取证.md",
    "Identify whether the first high-value surface is process state, credentials, handles, or network remnants before large plugin sweeps.",
  ],
  [
    "misc-audio",
    "misc",
    "Audio stego representation routing",
    ["audio", "stego", "spectrum", "waveform", "dtmf", "lsb"],
    "音频隐写.md",
    "Inspect waveform, spectrum, channels, duration, and metadata before choosing a decoding family.",
  ],
  [
    "misc-qr",
    "misc",
    "QR reconstruction and decode routing",
    ["qr", "qrcode", "finder", "mask", "rotation", "repair"],
    "二维码隐写.md",
    "Check finder patterns, orientation, masking, and error-correction clues before attempting manual reconstruction or decoding.",
  ],
  [
    "misc-jsfuck",
    "misc",
    "Obfuscated script representation routing",
    ["jsfuck", "obfuscation", "eval", "unicode", "packer", "decode"],
    "JSFuck编码.md",
    "Classify the encoding family and produce one safe deobfuscation layer before interpreting behavior or searching for flags.",
  ],
  [
    "misc-pyjail",
    "misc",
    "Python sandbox and pyjail routing",
    ["pyjail", "sandbox", "builtin", "blacklist", "eval", "import"],
    "Python沙箱逃逸.md",
    "Classify whether the jail restricts builtins, syntax, imports, or output before attempting object-graph traversal.",
  ],
  [
    "misc-layered-encoding",
    "misc",
    "Layered custom encoding routing",
    ["encoding", "base64", "hex", "rot", "custom alphabet", "layered"],
    "编码还是密码.md",
    "Perform one reversible normalization pass to separate pure representation layers from real cryptographic structure.",
  ],
  [
    "misc-protocol-puzzle",
    "misc",
    "Protocol-state and puzzle routing",
    ["protocol", "state machine", "menu", "interactive", "framing", "oracle"],
    "流量分析.md",
    "Use one bounded interaction to determine whether the dominant challenge surface is framing, state sequencing, or hidden protocol semantics.",
  ],
]

export { TOPICS }

function parseArgs(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  const check = argv.includes("--check")
  const report = argv.includes("--report")
  return {
    source: path.resolve(value("--source", DEFAULT_SOURCE)),
    id: value("--id", DEFAULT_ID),
    check,
    report,
    write: argv.includes("--write") || (!check && !report),
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function normalized(text) {
  return text.replace(/\r\n?/g, "\n")
}

async function walk(root, dir = root, out = []) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(root, full, out)
    else if (entry.isFile()) {
      const info = await stat(full)
      out.push({ path: path.relative(root, full).replace(/\\/g, "/"), size: info.size })
    }
  }
  return out
}

function sourceCommit(source) {
  const result = spawnSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8", shell: false })
  return result.status === 0 ? result.stdout.trim() : "unknown"
}

async function selectedSourceRecords(source) {
  const names = (await readdir(source))
    .filter((name) => name === "AI-SEARCH-INDEX.md" || name === "PAYLOAD-CHEATSHEET.md" || name.endsWith(".idx.md"))
    .sort()
  const records = []
  for (const name of names) {
    const content = normalized(await readFile(path.join(source, name), "utf8"))
    records.push({ path: name, sha256: sha256(content), bytes: Buffer.byteLength(content) })
  }
  return records
}

export { selectedSourceRecords }

const KNOWN_SOURCE_FILES = new Set([
  "AI-SEARCH-INDEX.md",
  "JWT.idx.md",
  "JWT.md",
  "PAYLOAD-CHEATSHEET.md",
  "php代码审计.idx.md",
  "php代码审计.md",
  "PHP反序列化漏洞总结.idx.md",
  "PHP反序列化漏洞总结.md",
  "SQL.idx.md",
  "SQL.md",
  "SSRF漏洞.idx.md",
  "SSRF漏洞.md",
  "SSTI.md",
  "命令执行.idx.md",
  "命令执行.md",
  "图片隐写.idx.md",
  "图片隐写.md",
  "文件包含.idx.md",
  "文件包含.md",
  "文件上传漏洞.idx.md",
  "文件上传漏洞.md",
  "压缩包总结.idx.md",
  "压缩包总结.md",
  "音频隐写.md",
])

function runtimeSourceFile(sourceFile) {
  return KNOWN_SOURCE_FILES.has(sourceFile) ? sourceFile : "AI-SEARCH-INDEX.md"
}

function buildCards(commit) {
  const cards = TOPICS.map(([suffix, category, title, aliases, sourceFile, probe]) => ({
    id: `des-ctf-${suffix}`,
    source: "des-ctf-knowledge",
    source_file: runtimeSourceFile(sourceFile),
    source_hint: sourceFile,
    source_repo: UPSTREAM,
    source_commit: commit,
    license_note: LICENSE_NOTE,
    category,
    title,
    kind: "workflow",
    trigger: `Current evidence matches: ${aliases.join(", ")}. Use this as pattern recall, not as an answer lookup.`,
    first_safe_check: probe,
    oracle: "The controlled probe produces a stable differential that identifies one technique family or rules it out.",
    stop_rule:
      "Stop after two calibrated checks with no differential; record the result and pivot instead of varying payload syntax.",
    pivot_rule:
      "Pivot to the adjacent parser, transport, representation, or trust-boundary family indicated by the observed differential.",
    keywords: aliases,
    snippet: `Paraphrased decision unit derived from ${sourceFile}; consult the local ignored mirror for source context.`,
    quality: 5,
    specificity: 4,
    curated: true,
    preconditions: ["Evidence contains at least one matching signal", "A bounded non-destructive probe is available"],
    confirm: "Expected differential is repeatable under one-variable control.",
    falsify: "Two calibrated controls remain identical and no expected oracle appears.",
    query_aliases: aliases,
    semantic_tokens: aliases,
    retrieval_intents: ["first-safe-check", "route-selection", "stop-rule"],
    rank_boost: 80,
  }))
  return `${JSON.stringify({ meta: { cards: cards.length, generated_at: "deterministic", source_repo: UPSTREAM, source_commit: commit, version: 1, curated_cards: cards.length, auto_cards: 0 }, cards }, null, 2)}\n`
}

export { buildCards }

async function buildOutputs(args) {
  if (!existsSync(args.source)) throw new Error(`source not found: ${args.source}`)
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(args.id)) throw new Error(`invalid source id: ${args.id}`)
  const files = await walk(args.source)
  const commit = sourceCommit(args.source)
  const selected = await selectedSourceRecords(args.source)
  const extensionCounts = {}
  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase() || "[none]"
    extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1
  }
  const cards = buildCards(commit)
  const manifest = `${JSON.stringify(
    {
      schema_version: 1,
      source_id: args.id,
      source_repo: UPSTREAM,
      source_commit: commit,
      local_mirror: `rag/Des-CTF-Knowledge`,
      local_mirror_committed: false,
      compilation_license: "MIT",
      license_note: LICENSE_NOTE,
      import_policy: "Complete local mirror; only attributed compact derivatives are committed or published.",
      source_summary: {
        files: files.length,
        bytes: files.reduce((sum, file) => sum + file.size, 0),
        extension_counts: extensionCounts,
      },
      selected_index_sources: selected,
      excluded_from_committed_assets: [
        "CTF大赛WP集合/articles/**",
        "CTF常用脚本及工具/**",
        "raw scripts and binaries",
        "exact flags and secrets",
      ],
      generated_assets: ["rag/knowledge/pattern-cards/des-ctf/des-ctf.cards.v1.json"],
      generated_card_count: TOPICS.length,
    },
    null,
    2,
  )}\n`
  return { files, commit, selected, cards, manifest }
}

export { buildOutputs }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const output = await buildOutputs(args)
  const mirror = path.join(ROOT, "rag", "Des-CTF-Knowledge")
  const manifestPath = path.join(ROOT, "rag", "knowledge", "sources", `${args.id}.manifest.json`)
  const cardsPath = path.join(ROOT, "rag", "knowledge", "pattern-cards", "des-ctf", "des-ctf.cards.v1.json")

  console.log(`source=${args.source}`)
  console.log(`source_commit=${output.commit}`)
  console.log(`files=${output.files.length}`)
  console.log(`bytes=${output.files.reduce((sum, file) => sum + file.size, 0)}`)
  console.log(`selected_index_sources=${output.selected.length}`)
  console.log(`generated_cards=${TOPICS.length}`)
  console.log(`mirror=${mirror}`)

  if (args.report) return
  if (args.check) {
    const currentManifest = existsSync(manifestPath) ? await readFile(manifestPath, "utf8") : ""
    const currentCards = existsSync(cardsPath) ? await readFile(cardsPath, "utf8") : ""
    if (currentManifest !== output.manifest || currentCards !== output.cards || !existsSync(args.source)) {
      console.error("knowledge import drift or local mirror missing")
      process.exit(1)
    }
    console.log("knowledge_import_check_ok")
    return
  }
  if (args.write) {
    await mkdir(path.dirname(manifestPath), { recursive: true })
    await mkdir(path.dirname(cardsPath), { recursive: true })
    await writeFile(manifestPath, output.manifest)
    await writeFile(cardsPath, output.cards)
    console.log("knowledge_import_written")
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
