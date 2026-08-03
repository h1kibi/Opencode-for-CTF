import type { CtfCategory } from "./index.ts"

/** User-facing solve intensity. `auto` lets the router choose fast vs expert. */
export type SolveMode = "auto" | "fast" | "expert"

/** Stable tool packs the runtime can enable lazily. */
export type ToolPack = "core" | "web" | "pwn" | "rev" | "crypto" | "forensics" | "misc" | "android" | "godot" | "java"

export type CategoryScore = {
  category: CtfCategory
  score: number
  reasons: string[]
}

export type RouteInput = {
  /** Free-text challenge description, path, URL, or notes. */
  text?: string
  /** Optional pre-extracted signal tags (e.g. from triage tools). */
  signals?: string[]
  /** True when work/ctf-evidence/<slug>/ already has useful state. */
  hasEvidenceBranch?: boolean
  /** Force a mode; default auto. */
  mode?: SolveMode
}

export type RouteDecision = {
  /** Execution lane after routing. `resume` is an expert recovery mode. */
  mode: "fast" | "expert" | "resume"
  /** Stable lane name for consumers that do not need resume semantics. */
  lane: "fast" | "expert"
  category?: CtfCategory
  /** The only valid primary agents are ctf-fast and ctf-expert. */
  primaryAgent: "ctf-fast" | "ctf-expert"
  /** @deprecated Use primaryAgent. Kept for adapter compatibility. */
  agent: "ctf-fast" | "ctf-expert"
  /** Canonical slash command for humans / slash menus. */
  command: string
  /** Skills the agent should load first. */
  skills: string[]
  /** Tool packs to prefer for this route. */
  toolPacks: ToolPack[]
  /** MCP profile selected by lane and family. */
  mcpProfile: string
  /** Capabilities unavailable in the current runtime (filled by readiness). */
  missingCapabilities: string[]
  /** Readiness is unknown until the runtime overlays registered tools/MCP probes. */
  readiness: "unknown" | "ready" | "degraded" | "blocked"
  /** Human-readable routing rationale. */
  reasons: string[]
  /** 0–1 confidence in the top category / mode choice. */
  confidence: number
  /** Secondary categories still plausible. */
  alternates: CategoryScore[]
}

const CATEGORY_SKILLS: Record<CtfCategory, string[]> = {
  web: ["ctf-common", "ctf-terminal", "ctf-web"],
  pwn: ["ctf-common", "ctf-terminal", "ctf-pwn"],
  rev: ["ctf-common", "ctf-terminal", "ctf-rev"],
  crypto: ["ctf-common", "ctf-terminal", "ctf-crypto"],
  forensics: ["ctf-common", "ctf-terminal", "ctf-forensics"],
  misc: ["ctf-common", "ctf-terminal", "ctf-misc"],
}

const CATEGORY_PACKS: Record<CtfCategory, ToolPack[]> = {
  web: ["core", "web"],
  pwn: ["core", "pwn"],
  rev: ["core", "rev"],
  crypto: ["core", "crypto"],
  forensics: ["core", "forensics"],
  misc: ["core", "misc"],
}

/** Keyword / pattern weights used for cheap text scoring. */
const CATEGORY_PATTERNS: Record<CtfCategory, Array<{ re: RegExp; weight: number; reason: string }>> = {
  web: [
    { re: /\bhttps?:\/\//i, weight: 18, reason: "HTTP(S) URL" },
    { re: /\b(flask|django|express|php|spring|laravel|next\.?js|node\.js)\b/i, weight: 14, reason: "web framework" },
    { re: /\b(xss|sqli|ssrf|ssti|lfi|rce|jwt|oauth|graphql|csrf|idor)\b/i, weight: 16, reason: "web vuln keyword" },
    { re: /\b(cookie|session|upload|admin.?bot|sourcemap|\.js\.map)\b/i, weight: 10, reason: "web surface signal" },
    { re: /\.(html?|php|jsp|aspx)\b/i, weight: 8, reason: "web file extension" },
  ],
  pwn: [
    {
      re: /\b(checksec|pwntools|libc|ld-linux|ret2|rop|srop|heap|uaf|tcache|fsop|format.?string)\b/i,
      weight: 18,
      reason: "pwn technique",
    },
    { re: /\b(elf|gdb|pwndbg|gef|qemu|seccomp|shellcode|got|plt)\b/i, weight: 14, reason: "binary exploit tooling" },
    { re: /\b(nc|netcat)\s+\S+\s+\d{2,5}\b/i, weight: 12, reason: "remote nc service" },
    { re: /\b(chall|pwn|vuln|baby)\b/i, weight: 6, reason: "pwn-ish name" },
    { re: /\.(elf|so|bin)\b/i, weight: 8, reason: "binary extension" },
  ],
  rev: [
    {
      re: /\b(ghidra|ida|binary.?ninja|angr|unicorn|frida|jadx|apktool|ilspy|dnspy)\b/i,
      weight: 16,
      reason: "rev tooling",
    },
    {
      re: /\b(crackme|obfuscat|anti.?debug|packer|upx|vm.?protect|dex|smali|godot|gdc)\b/i,
      weight: 14,
      reason: "rev artifact",
    },
    { re: /\b(decompile|disassembl|reverse)\b/i, weight: 10, reason: "rev wording" },
    { re: /\.(apk|exe|dll|dex|pyc|class)\b/i, weight: 10, reason: "rev file extension" },
  ],
  crypto: [
    {
      re: /\b(rsa|aes|ecc|ecdsa|lattice|lll|coppersmith|padding.?oracle|cbc|gcm|xor|nonce|prng|lfsr)\b/i,
      weight: 18,
      reason: "crypto primitive",
    },
    {
      re: /\b(ciphertext|plaintext|modulus|totient|sage|z3|hash.?length.?extension)\b/i,
      weight: 14,
      reason: "crypto workflow",
    },
    { re: /\b(encrypt|decrypt|cipher)\b/i, weight: 8, reason: "crypto wording" },
    { re: /\.(sage|pem|der)\b/i, weight: 6, reason: "crypto file extension" },
  ],
  forensics: [
    {
      re: /\b(pcap|pcapng|wireshark|volatility|memory.?dump|disk.?image|stego|exif|binwalk)\b/i,
      weight: 18,
      reason: "forensics artifact",
    },
    { re: /\b(ntfs|ext4|registry|prefetch|evtx|timeline)\b/i, weight: 12, reason: "host forensics" },
    { re: /\.(pcap|pcapng|raw|mem|e01|vmdk|img|iso)\b/i, weight: 14, reason: "forensics extension" },
    { re: /\b(steganograph|hidden.?data|carving)\b/i, weight: 10, reason: "stego/carving" },
  ],
  misc: [
    {
      re: /\b(pyjail|jail|sandbox.?escape|esolang|programming.?challenge|game|pygame|godot)\b/i,
      weight: 14,
      reason: "misc pattern",
    },
    { re: /\b(osint|geoloc|qr.?code|encoding|base64|rot13)\b/i, weight: 8, reason: "misc/osint signal" },
    { re: /\b(rf|sdr|hackrf|gnuradio)\b/i, weight: 12, reason: "RF/misc hardware" },
  ],
}

const SPECIALIST_PACK_PATTERNS: Array<{ re: RegExp; packs: ToolPack[]; reason: string }> = [
  { re: /\b(android|apk|dex|smali|jadx|frida)\b|\.apk\b/i, packs: ["android"], reason: "android overlay" },
  { re: /\b(godot|gdscript|gdc|pck)\b|\.(pck|gdc)\b/i, packs: ["godot"], reason: "godot overlay" },
  {
    re: /\b(java|spring|jar|class|bytecode|deseriali[sz]ation)\b|\.(jar|war|class)\b/i,
    packs: ["java"],
    reason: "java overlay",
  },
]

function specialistOverlays(corpus: string): { packs: ToolPack[]; reasons: string[] } {
  const packs = new Set<ToolPack>()
  const reasons: string[] = []
  for (const pattern of SPECIALIST_PACK_PATTERNS) {
    if (!pattern.re.test(corpus)) continue
    pattern.packs.forEach((pack) => packs.add(pack))
    reasons.push(pattern.reason)
  }
  return { packs: [...packs], reasons }
}

const HARD_SIGNAL_PATTERNS: RegExp[] = [
  /\bdocker-compose\b/i,
  /\bdockerfile\b/i,
  /\bmulti.?service\b/i,
  /\bsource.?rich\b/i,
  /\bwhite.?box\b/i,
  /\bpacked\b/i,
  /\bkernel\b/i,
  /\bheap\b/i,
  /\bbrowser.?bot\b/i,
  /\bchain\b/i,
  /\bjava\b/i,
  /\bspring\b/i,
  /\bandroid\b/i,
]

/**
 * Count distinct hard signals. A single ambiguous word (java/heap/…) is NOT
 * enough to force the expert lane — two or more, or one hard signal on top of
 * a real category score, is (calibration per evaluation report §4.6).
 */
function hardSignalCount(corpus: string): number {
  return HARD_SIGNAL_PATTERNS.reduce((count, re) => (re.test(corpus) ? count + 1 : count), 0)
}

const RESUME_SIGNALS = /\b(resume|continue|evidence.?branch|work\/ctf-evidence)\b/i

function normalizeCorpus(input: RouteInput): string {
  const parts = [input.text ?? "", ...(input.signals ?? [])]
  return parts.join("\n").toLowerCase()
}

/** Score all categories from free text + signal tags. */
export function scoreCategories(input: RouteInput): CategoryScore[] {
  const corpus = normalizeCorpus(input)
  if (!corpus.trim()) {
    return (Object.keys(CATEGORY_PATTERNS) as CtfCategory[]).map((category) => ({
      category,
      score: 0,
      reasons: [],
    }))
  }

  const scores: CategoryScore[] = []
  for (const category of Object.keys(CATEGORY_PATTERNS) as CtfCategory[]) {
    const reasons: string[] = []
    let score = 0
    for (const rule of CATEGORY_PATTERNS[category]) {
      if (rule.re.test(corpus)) {
        score += rule.weight
        reasons.push(rule.reason)
      }
    }
    // Explicit category words in text are strong priors.
    if (new RegExp(`\\b${category}\\b`, "i").test(corpus)) {
      score += 20
      reasons.push(`explicit category token: ${category}`)
    }
    scores.push({ category, score, reasons })
  }

  return scores.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category))
}

function pickMode(input: RouteInput, top: CategoryScore, ranked: CategoryScore[]): "fast" | "expert" {
  if (input.mode === "fast") return "fast"
  if (input.mode === "expert") return "expert"

  const corpus = normalizeCorpus(input)
  const hards = hardSignalCount(corpus)
  if (hards >= 2) return "expert"
  if (hards === 1 && top.score >= 12) return "expert"
  if (top.score >= 40 && ranked[1] && top.score - ranked[1].score >= 12) return "fast"
  if (top.score > 0 && top.score < 16) return "expert"
  if (ranked.filter((s) => s.score > 0).length >= 3) return "expert"
  return top.score >= 22 ? "fast" : "expert"
}

function confidenceFrom(top: CategoryScore, second?: CategoryScore): number {
  if (top.score <= 0) return 0.15
  const gap = top.score - (second?.score ?? 0)
  // Calibrated confidence: evidence mass + category separation, capped at 0.9.
  // A single ambiguous keyword (e.g. bare "heap") must not yield ~0.95.
  const mass = Math.min(1, top.score / 60)
  const separation = Math.min(1, Math.max(0, gap) / 50)
  const raw = 0.1 + 0.55 * mass + 0.25 * separation
  return Math.round(Math.min(0.9, Math.max(0.1, raw)) * 100) / 100
}

/**
 * Pure category + mode router used by `/ctf`, tools, and docs generators.
 * Does not touch the filesystem — callers supply evidence/resume hints.
 */
export function decideRoute(input: RouteInput = {}): RouteDecision {
  const ranked = scoreCategories(input)
  const top = ranked[0] ?? { category: "misc" as CtfCategory, score: 0, reasons: [] }
  const second = ranked[1]
  const corpus = normalizeCorpus(input)
  const overlays = specialistOverlays(corpus)

  if (input.hasEvidenceBranch || RESUME_SIGNALS.test(corpus)) {
    return {
      mode: "resume",
      lane: "expert",
      category: top.score > 0 ? top.category : undefined,
      primaryAgent: "ctf-expert",
      agent: "ctf-expert",
      command: "/resume",
      skills: ["ctf-common", "ctf-expert"],
      toolPacks: [
        ...new Set<ToolPack>(["core", ...(top.score > 0 ? CATEGORY_PACKS[top.category] : []), ...overlays.packs]),
      ],
      mcpProfile: "expert-resume",
      missingCapabilities: [],
      readiness: "unknown",
      reasons: [
        input.hasEvidenceBranch ? "existing evidence branch detected" : "resume/continue wording in challenge context",
        ...top.reasons.slice(0, 3),
        ...overlays.reasons,
      ],
      confidence: Math.max(0.55, confidenceFrom(top, second)),
      alternates: ranked.filter((s) => s.score > 0).slice(1, 4),
    }
  }

  const mode = pickMode(input, top, ranked)
  const strongCategory = top.score >= 28 && (!second || top.score - second.score >= 10)

  if (strongCategory && mode === "fast") {
    const category = top.category
    return {
      mode: "fast",
      lane: "fast",
      category,
      primaryAgent: "ctf-fast",
      agent: "ctf-fast",
      command: "/ctf-fast",
      skills: CATEGORY_SKILLS[category],
      toolPacks: [...new Set<ToolPack>([...CATEGORY_PACKS[category], ...overlays.packs])],
      mcpProfile: `fast-${category}`,
      missingCapabilities: [],
      readiness: "unknown",
      reasons: [`strong ${category} signals`, ...top.reasons.slice(0, 4), ...overlays.reasons],
      confidence: confidenceFrom(top, second),
      alternates: ranked.filter((s) => s.score > 0).slice(1, 4),
    }
  }

  if (mode === "expert") {
    return {
      mode: "expert",
      lane: "expert",
      category: top.score > 0 ? top.category : undefined,
      primaryAgent: "ctf-expert",
      agent: "ctf-expert",
      command: "/ctf-expert",
      skills: [
        "ctf-common",
        "ctf-expert",
        "ctf-router",
        ...(top.score > 0
          ? CATEGORY_SKILLS[top.category].filter((s) => s.startsWith("ctf-") && !s.endsWith("common"))
          : []),
      ],
      toolPacks: [
        ...new Set<ToolPack>([
          "core",
          ...(top.score > 0 ? CATEGORY_PACKS[top.category].filter((p) => p !== "core") : []),
          ...overlays.packs,
        ]),
      ],
      mcpProfile: `expert-${top.score > 0 ? top.category : "common"}`,
      missingCapabilities: [],
      readiness: "unknown",
      reasons: [
        top.score > 0 ? `leading category: ${top.category}` : "category unclear — expert triage",
        ...top.reasons.slice(0, 3),
        ...(hardSignalCount(corpus) > 0 ? ["hard/source-rich/multi-artifact signals"] : []),
        ...overlays.reasons,
      ],
      confidence: confidenceFrom(top, second),
      alternates: ranked.filter((s) => s.score > 0).slice(0, 4),
    }
  }

  return {
    mode: "fast",
    lane: "fast",
    category: top.score > 0 ? top.category : undefined,
    primaryAgent: "ctf-fast",
    agent: "ctf-fast",
    command: "/ctf-fast",
    skills: ["ctf-common", "ctf-terminal", "ctf-router"],
    toolPacks: [
      ...new Set<ToolPack>([
        "core",
        ...(top.score > 0 ? CATEGORY_PACKS[top.category].filter((p) => p !== "core") : []),
        ...overlays.packs,
      ]),
    ],
    mcpProfile: `fast-${top.score > 0 ? top.category : "common"}`,
    missingCapabilities: [],
    readiness: "unknown",
    reasons: [
      top.score > 0 ? `likely ${top.category} — fast lane` : "no strong signals — fast triage first",
      ...top.reasons.slice(0, 3),
    ],
    confidence: confidenceFrom(top, second),
    alternates: ranked.filter((s) => s.score > 0).slice(1, 4),
  }
}

// ---------------------------------------------------------------------------
// Cheap file probes (pure — callers feed the results back as signals)
// ---------------------------------------------------------------------------

const FILE_EXTENSION_SIGNALS: Array<{ re: RegExp; signals: string[] }> = [
  { re: /\.(php|jsp|asp|aspx|html?)$/i, signals: ["web"] },
  { re: /\.(js|mjs|json)$/i, signals: ["web"] },
  { re: /\.(elf|so|bin|out)$/i, signals: ["pwn", "rev"] },
  { re: /\.(exe|dll|sys)$/i, signals: ["rev"] },
  { re: /\.(apk|dex|jar|class|war)$/i, signals: ["rev", "java"] },
  { re: /\.(pyc|pyo)$/i, signals: ["rev"] },
  { re: /\.(pcap|pcapng)$/i, signals: ["forensics"] },
  { re: /\.(png|jpg|jpeg|gif|bmp|webp)$/i, signals: ["forensics", "stego"] },
  { re: /\.(zip|7z|rar|gz|tar|bz2|xz)$/i, signals: ["forensics"] },
  { re: /\.(wav|mp3|flac|ogg)$/i, signals: ["forensics", "audio"] },
  { re: /\.(pdf|docx|xlsx|pptx|doc|xls)$/i, signals: ["forensics"] },
  { re: /\.(sage|pem|der|key)$/i, signals: ["crypto"] },
]

/**
 * Probe a challenge file list (names only — cheap, no content access) and
 * return signal tags the router can consume. Pure function, no I/O.
 */
export function probeFileTree(fileNames: string[]): string[] {
  const signals = new Set<string>()
  for (const name of fileNames ?? []) {
    for (const rule of FILE_EXTENSION_SIGNALS) {
      if (rule.re.test(name)) for (const signal of rule.signals) signals.add(signal)
    }
    if (/^chall|^pwn|^vuln|^baby|^fmt|^heap/i.test(name)) signals.add("pwn-ish-name")
    if (/^readme/i.test(name)) signals.add("readme")
    if (/^dockerfile|docker-compose/i.test(name)) signals.add("multi-service")
    if (/^source|^src\b|\.java$/i.test(name)) signals.add("source-rich")
  }
  return [...signals]
}

const MAGIC_SIGNALS: Array<{ magic: string; signals: string[] }> = [
  { magic: "7f454c46", signals: ["elf"] },
  { magic: "4d5a", signals: ["pe"] },
  { magic: "504b0304", signals: ["zip"] },
  { magic: "d0cf11e0a1b11ae1", signals: ["ole"] },
  { magic: "89504e470d0a1a0a", signals: ["png"] },
  { magic: "ffd8ff", signals: ["jpeg"] },
  { magic: "474946383961|474946383761", signals: ["gif"] },
  { magic: "52494646", signals: ["riff"] },
  { magic: "d4c3b2a1|a1b2c3d4", signals: ["pcap"] },
  { magic: "1f8b", signals: ["gzip"] },
  { magic: "25504446", signals: ["pdf"] },
]

/**
 * Probe file magic bytes (hex prefix of each attachment) and return signal
 * tags. Pure function — callers read the bytes.
 */
export function probeFileMagic(hexHeaders: Array<{ name: string; hex: string }>): string[] {
  const signals = new Set<string>()
  for (const entry of hexHeaders ?? []) {
    const hex = String(entry?.hex ?? "")
      .replace(/[^0-9a-fA-F]/g, "")
      .toLowerCase()
    for (const rule of MAGIC_SIGNALS) {
      if (rule.magic.split("|").some((magic) => hex.startsWith(magic))) {
        for (const signal of rule.signals) signals.add(signal)
      }
    }
  }
  return [...signals]
}

/** L0 commands users should learn first. Everything else is advanced. */
export const COMMAND_SURFACE = {
  L0: [
    { command: "/ctf", purpose: "Default entry — auto-route and solve" },
    { command: "/help", purpose: "Show command surface and routing rules" },
    { command: "/ctf-fast", purpose: "Force lightweight fast lane" },
    { command: "/ctf-expert", purpose: "Force evidence-driven expert lane" },
    { command: "/resume", purpose: "Resume an existing evidence branch" },
  ],
  L1: [
    { command: "/ctf-web", purpose: "Web specialist" },
    { command: "/ctf-pwn", purpose: "Pwn specialist" },
    { command: "/ctf-rev", purpose: "Reverse specialist" },
    { command: "/ctf-crypto", purpose: "Crypto specialist" },
    { command: "/ctf-forensics", purpose: "Forensics specialist" },
    { command: "/ctf-misc", purpose: "Misc specialist" },
  ],
  note: "Only /ctf, /help, /ctf-fast, /ctf-expert, /resume, and the family specialist commands are installed as slash-command entrypoints. Advanced flows are reached through /ctf, /ctf-expert, tools, and skills.",
} as const

/** Format a route decision for agent prompts or tool output. */
export function formatRouteDecision(decision: RouteDecision): string {
  const lines = [
    `mode: ${decision.mode}`,
    `lane: ${decision.lane}`,
    `primary_agent: ${decision.primaryAgent}`,
    `agent: ${decision.primaryAgent}`,
    `command: ${decision.command}`,
    decision.category ? `category: ${decision.category}` : "category: unknown",
    `confidence: ${decision.confidence}`,
    `skills: ${decision.skills.join(", ")}`,
    `tool_packs: ${decision.toolPacks.join(", ")}`,
    `mcp_profile: ${decision.mcpProfile}`,
    `readiness: ${decision.readiness}`,
    ...decision.reasons.map((r) => `  - ${r}`),
  ]
  if (decision.alternates.length) {
    lines.push("alternates:")
    for (const alt of decision.alternates) {
      lines.push(`  - ${alt.category} (${alt.score}) ${alt.reasons.slice(0, 2).join("; ")}`)
    }
  }
  return lines.join("\n")
}
