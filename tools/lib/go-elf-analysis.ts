export type ElfSection = {
  name: string
  offset: number
  size: number
  addr: number
}

export type GoPclnFunction = {
  entry: string
  entry_offset: string
  func_offset: string
  name_offset: string
  name: string
}

export type GoPivotHints = {
  priorityFunctions: GoPclnFunction[]
  pivotLines: string[]
}

export type GoCallHint = {
  caller: string
  callee: string
  callsite: string
}

export type GoHelperChain = {
  root: string
  chain: string[]
  reason: string
}

export type GoExecutionPlanStep = {
  tool: "reva" | "ida" | "slice"
  target: string
  note: string
}

export type GoExecutionPlan = {
  summary: string
  steps: GoExecutionPlanStep[]
}

function u16le(buf: Buffer, off: number) {
  return off + 2 <= buf.length ? buf.readUInt16LE(off) : 0
}
function u32le(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readUInt32LE(off) : 0
}
function i32le(buf: Buffer, off: number) {
  return off + 4 <= buf.length ? buf.readInt32LE(off) : 0
}
function u64le(buf: Buffer, off: number) {
  return off + 8 <= buf.length ? Number(buf.readBigUInt64LE(off)) : 0
}

function readCString(buf: Buffer, off: number, maxLen = 512) {
  if (off < 0 || off >= buf.length) return ""
  let end = off
  while (end < buf.length && end - off < maxLen && buf[end] !== 0) end++
  return end > off ? buf.subarray(off, end).toString("latin1") : ""
}

function scanAsciiAt(buf: Buffer, start: number, maxLen = 256) {
  let end = start
  while (end < buf.length && end - start < maxLen) {
    const b = buf[end]
    if (b < 0x20 || b > 0x7e) break
    end++
  }
  return end > start ? buf.subarray(start, end).toString("latin1") : ""
}

export function parseElfSections(buf: Buffer): ElfSection[] {
  if (buf.length < 0x40) return []
  if (!buf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return []
  const cls = buf[4]
  const endian = buf[5]
  if (endian !== 1) return []

  const is64 = cls === 2
  const shoff = is64 ? u64le(buf, 0x28) : u32le(buf, 0x20)
  const shentsize = is64 ? u16le(buf, 0x3a) : u16le(buf, 0x2e)
  const shnum = is64 ? u16le(buf, 0x3c) : u16le(buf, 0x30)
  const shstrndx = is64 ? u16le(buf, 0x3e) : u16le(buf, 0x32)
  if (!shoff || !shentsize || !shnum || shoff + shentsize * shnum > buf.length) return []

  const raw = [] as Array<{ nameOff: number; addr: number; offset: number; size: number }>
  for (let i = 0; i < shnum; i++) {
    const base = shoff + i * shentsize
    if (base + shentsize > buf.length) break
    const nameOff = u32le(buf, base)
    const addr = is64 ? u64le(buf, base + 0x10) : u32le(buf, base + 0x0c)
    const offset = is64 ? u64le(buf, base + 0x18) : u32le(buf, base + 0x10)
    const size = is64 ? u64le(buf, base + 0x20) : u32le(buf, base + 0x14)
    raw.push({ nameOff, addr, offset, size })
  }
  const shstr = raw[shstrndx]
  if (!shstr || shstr.offset + shstr.size > buf.length) return []
  const shstrtab = buf.subarray(shstr.offset, shstr.offset + shstr.size)
  return raw.map((s) => ({
    name: readCString(shstrtab, s.nameOff, 256),
    offset: s.offset,
    size: s.size,
    addr: s.addr,
  }))
}

export function collectGoNameCandidates(buf: Buffer, max = 200) {
  const names: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < buf.length - 12 && names.length < max; i++) {
    const s = scanAsciiAt(buf, i, 192)
    if (!s) continue
    if (
      /^(?:main|runtime|fmt|bytes|strings|os|io|net|crypto(?:\/[A-Za-z0-9_]+)?|encoding(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_$.]+$/.test(
        s,
      )
    ) {
      if (!seen.has(s)) {
        seen.add(s)
        names.push(s)
      }
      i += Math.max(0, s.length - 1)
    }
  }
  return names
}

export function findGopclntabOffsets(buf: Buffer, max = 12) {
  const hits: string[] = []
  const markers = [
    Buffer.from(".gopclntab", "latin1"),
    Buffer.from("runtime.main", "latin1"),
    Buffer.from("main.main", "latin1"),
  ]
  for (const marker of markers) {
    let off = 0
    while (off < buf.length && hits.length < max) {
      const idx = buf.indexOf(marker, off)
      if (idx < 0) break
      hits.push(`0x${idx.toString(16)}`)
      off = idx + 1
    }
  }
  return Array.from(new Set(hits)).slice(0, max)
}

export function classifyGoFunctions(names: string[]) {
  const userCode = names.filter((s) => /^main\./.test(s) && !/^main\.init(\.|$)/.test(s))
  const runtimeNoise = names.filter((s) => /^runtime\./.test(s))
  const initChain = names.filter((s) => /(?:^main\.init|\.init$|\.init\.)/.test(s)).slice(0, 40)
  const decoderLike = names
    .filter((s) => /base64|decode|decrypt|unmarshal|parse|check|verify|compare/i.test(s))
    .slice(0, 60)
  return { userCode, runtimeNoise, initChain, decoderLike }
}

export function parseGoPclntab(
  section: Buffer,
  sectionAddr = 0,
): {
  header_ok: boolean
  ptr_size: number
  nfunc: number
  text_start: number
  funcname_offset: number
  pcln_offset: number
  functions: GoPclnFunction[]
} {
  if (section.length < 72)
    return { header_ok: false, ptr_size: 0, nfunc: 0, text_start: 0, funcname_offset: 0, pcln_offset: 0, functions: [] }
  const magic = u32le(section, 0)
  const ptrSize = section[7]
  const validMagic = new Set([0xfffffff1, 0xfffffff0, 0xfffffffb, 0xfffffffa])
  const headerOk = validMagic.has(magic) && (ptrSize === 4 || ptrSize === 8)
  if (!headerOk)
    return {
      header_ok: false,
      ptr_size: ptrSize,
      nfunc: 0,
      text_start: 0,
      funcname_offset: 0,
      pcln_offset: 0,
      functions: [],
    }

  const word = (off: number) => (ptrSize === 8 ? u64le(section, off) : u32le(section, off))
  const nfunc = word(8)
  const textStart = word(8 + ptrSize * 2)
  const funcnameOffset = word(8 + ptrSize * 3)
  const pclnOffset = word(8 + ptrSize * 7)
  const headerSize = 8 + ptrSize * 8
  const maxFuncs = Math.min(nfunc, 2000)
  const functions: GoPclnFunction[] = []

  for (let i = 0; i < maxFuncs; i++) {
    const tab = headerSize + i * 8
    if (tab + 8 > section.length) break
    const entryOff = u32le(section, tab)
    const funcOff = u32le(section, tab + 4)
    if (!funcOff || funcOff + 8 > section.length) continue
    const nameRel = i32le(section, funcOff + 4)
    if (nameRel < 0) continue
    const name = readCString(section, funcnameOffset + nameRel, 256)
    if (!name) continue
    if (
      !/^(?:main|runtime|fmt|bytes|strings|os|io|net|encoding(?:\/[A-Za-z0-9_]+)?|crypto(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_$.]+$/.test(
        name,
      )
    )
      continue
    functions.push({
      entry: `0x${(textStart + entryOff).toString(16)}`,
      entry_offset: `0x${entryOff.toString(16)}`,
      func_offset: `0x${funcOff.toString(16)}`,
      name_offset: `0x${nameRel.toString(16)}`,
      name,
    })
    if (functions.length >= 400) break
  }

  return {
    header_ok: true,
    ptr_size: ptrSize,
    nfunc,
    text_start: textStart || sectionAddr,
    funcname_offset: funcnameOffset,
    pcln_offset: pclnOffset,
    functions,
  }
}

export function detectGoFromStrings(strings: string[]) {
  const joined = strings.join("\n")
  const goSignals = [
    /go build id[:=]/i.test(joined) ? "go.buildid" : "",
    /\.gopclntab/i.test(joined) ? ".gopclntab" : "",
    /runtime\.main/i.test(joined) ? "runtime.main" : "",
    /main\.main/i.test(joined) ? "main.main" : "",
    /\/usr\/local\/go\/src\//i.test(joined) ? "goroot-source-paths" : "",
    /go1\.[0-9]+/.test(joined) ? "go-version-hint" : "",
  ].filter(Boolean)
  const functionNameHits = Array.from(
    new Set(
      strings.filter(
        (s) =>
          /\b(?:main|runtime)\.[A-Za-z0-9_]+\b/.test(s) ||
          /\b(?:fmt|bytes|strings|os|io|encoding(?:\/[A-Za-z0-9_]+)?|crypto(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_]+\b/.test(
            s,
          ),
      ),
    ),
  ).slice(0, 120)
  const runtime = goSignals.length >= 2 || functionNameHits.some((x) => x === "main.main") ? "go" : "unknown"
  return { runtime, goSignals, functionNameHits }
}

export function pickPriorityGoFunctions(functions: GoPclnFunction[], max = 8) {
  const scored = functions.map((fn) => {
    let score = 0
    if (fn.name === "main.main") score += 100
    if (/^main\.[A-Za-z0-9_$.]+$/.test(fn.name)) score += 40
    if (/base64|decode|decrypt|unmarshal|parse|check|verify|compare/i.test(fn.name)) score += 30
    if (/init/.test(fn.name)) score += 10
    if (/runtime\./.test(fn.name)) score -= 25
    return { fn, score }
  })
  return scored
    .sort((a, b) => b.score - a.score || a.fn.name.localeCompare(b.fn.name))
    .map((x) => x.fn)
    .slice(0, max)
}

export function buildGoPivotHints(functions: GoPclnFunction[]): GoPivotHints {
  const priorityFunctions = pickPriorityGoFunctions(functions, 8)
  const pivotLines: string[] = []
  for (const fn of priorityFunctions) {
    pivotLines.push(`ida-pro_decompile addr=${fn.entry}  # ${fn.name}`)
    pivotLines.push(`ReVa_get-decompilation functionNameOrAddress=${fn.entry}  # ${fn.name}`)
    pivotLines.push(`ctf-elf-slice address=${fn.entry.replace(/^0x/i, "")}  # ${fn.name}`)
  }
  return { priorityFunctions, pivotLines }
}

export function buildGoCallHints(disasmText: string, functions: GoPclnFunction[]) {
  const lines = String(disasmText || "").split(/\r?\n/)
  const addrToName = new Map<string, string>()
  const nameSet = new Set(functions.map((f) => f.name))
  for (const fn of functions) addrToName.set(fn.entry.replace(/^0x/i, "").toLowerCase(), fn.name)

  const hints: GoCallHint[] = []
  let currentCaller = ""
  for (const line of lines) {
    const fnLabel = line.match(/^([0-9a-f]+)\s+<([^>]+)>:$/i)
    if (fnLabel) {
      const addr = fnLabel[1].toLowerCase()
      currentCaller = addrToName.get(addr) || fnLabel[2]
      continue
    }
    const callHit = line.match(/^\s*([0-9a-f]+):.*\bcall\b.*\s([0-9a-f]+)\s+<([^>]+)>/i)
    if (callHit && currentCaller) {
      const callsite = `0x${callHit[1].toLowerCase()}`
      const targetAddr = callHit[2].toLowerCase()
      const targetName = addrToName.get(targetAddr) || callHit[3]
      if (
        /^(?:main|runtime|fmt|bytes|strings|os|io|net|encoding(?:\/[A-Za-z0-9_]+)?|crypto(?:\/[A-Za-z0-9_]+)?)\.[A-Za-z0-9_$.]+$/.test(
          targetName,
        ) ||
        nameSet.has(targetName)
      ) {
        hints.push({ caller: currentCaller, callee: targetName, callsite })
      }
    }
  }

  const priorityNames = new Set(pickPriorityGoFunctions(functions, 10).map((f) => f.name))
  const summary = hints
    .filter((h) => priorityNames.has(h.caller) || priorityNames.has(h.callee) || h.caller === "main.main")
    .slice(0, 40)
    .map((h) => `${h.caller} -> ${h.callee} @ ${h.callsite}`)

  return { hints: hints.slice(0, 120), summary }
}

export function buildGoHelperChains(functions: GoPclnFunction[], callHints: GoCallHint[]) {
  const priority = pickPriorityGoFunctions(functions, 12)
  const decoderLike = new Set(
    priority
      .filter((f) => /base64|decode|decrypt|unmarshal|parse|check|verify|compare/i.test(f.name))
      .map((f) => f.name),
  )
  const outgoing = new Map<string, string[]>()
  for (const h of callHints) {
    const list = outgoing.get(h.caller) ?? []
    if (!list.includes(h.callee)) list.push(h.callee)
    outgoing.set(h.caller, list)
  }

  const chains: GoHelperChain[] = []
  const roots = priority.map((f) => f.name)
  for (const root of roots) {
    const direct = outgoing.get(root) ?? []
    const preferredDirect = direct.filter((x) => decoderLike.has(x) || /^main\./.test(x)).slice(0, 3)
    if (preferredDirect.length) {
      for (const callee of preferredDirect) {
        chains.push({
          root,
          chain: [root, callee],
          reason: decoderLike.has(callee)
            ? "root calls decoder/check-like helper directly"
            : "root calls custom main.* helper directly",
        })
      }
      continue
    }
    for (const mid of direct.slice(0, 5)) {
      const second = outgoing.get(mid) ?? []
      const best = second.find((x) => decoderLike.has(x))
      if (best)
        chains.push({ root, chain: [root, mid, best], reason: "two-hop path from root into decoder/check-like helper" })
    }
  }

  const dedup = new Map<string, GoHelperChain>()
  for (const chain of chains) {
    const key = chain.chain.join(" -> ")
    if (!dedup.has(key)) dedup.set(key, chain)
  }
  const ordered = Array.from(dedup.values())
    .sort((a, b) => a.chain.length - b.chain.length || a.root.localeCompare(b.root))
    .slice(0, 12)
  const shortest = ordered[0] ?? null
  return {
    helperChains: ordered,
    shortestLogicChain: shortest,
    bestFirstTargets: shortest ? shortest.chain.slice(0, 3) : roots.slice(0, 3),
  }
}

export function buildGoExecutionPlan(functions: GoPclnFunction[], bestFirstTargets: string[]) {
  const steps: GoExecutionPlanStep[] = []
  const byName = new Map(functions.map((f) => [f.name, f]))
  for (const name of bestFirstTargets) {
    const fn = byName.get(name)
    if (!fn) continue
    steps.push({ tool: "reva", target: fn.entry, note: `${name} decompile first in ReVa` })
    steps.push({ tool: "ida", target: fn.entry, note: `${name} decompile in ida-pro if ReVa output is ambiguous` })
    steps.push({
      tool: "slice",
      target: fn.entry.replace(/^0x/i, ""),
      note: `${name} focused ELF slice around entry address`,
    })
  }
  return {
    summary: bestFirstTargets.length
      ? `default first-pass order: ${bestFirstTargets.join(" -> ")}`
      : "no structured Go execution plan",
    steps: steps.slice(0, 12),
  }
}
