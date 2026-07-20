export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function parseVersion(text: string) {
  const m = text.match(/glibc\s*2\.(\d+)|glibc 2\.(\d+)|gnu c library.*stable release version\s*2\.(\d+)/i)
  if (!m) return "unknown"
  const minor = m[1] || m[2] || m[3]
  return minor ? `2.${minor}` : "unknown"
}

export function parseMinor(version: string) {
  const m = version.match(/^2\.(\d+)$/)
  return m ? Number(m[1]) : -1
}

export function symbolOffsetHex(lines: string[], name: string) {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`)
  for (const line of lines) {
    if (!re.test(line)) continue
    const m = line.match(/\b([0-9a-f]{6,16})\b/i)
    if (m) return `0x${m[1]}`
  }
  return "unknown"
}

export function symbolOffsetBigInt(lines: string[], name: string) {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\b`)
  for (const line of lines) {
    if (!re.test(line)) continue
    const m = line.match(/\b([0-9a-f]{6,16})\b/i)
    if (m) return BigInt(`0x${m[1]}`)
  }
  return null
}

export function binshOffsetHex(buf: Buffer) {
  const needle = Buffer.from("/bin/sh\0", "latin1")
  const idx = buf.indexOf(needle)
  return idx >= 0 ? `0x${idx.toString(16)}` : "unknown"
}

export function binshOffsetBigInt(buf: Buffer) {
  const needle = Buffer.from("/bin/sh\0", "latin1")
  const idx = buf.indexOf(needle)
  return idx >= 0 ? BigInt(idx) : null
}

export function parseOneGadgetDetailed(text: string) {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!/^0x[0-9a-f]+/i.test(line) && !/^[0-9a-f]{6,}/i.test(line)) continue
    const addr = line.startsWith("0x") ? line.split(/\s+/)[0] : `0x${line.split(/\s+/)[0]}`
    const constraints: string[] = []
    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const c = lines[j].trim()
      if (/^0x[0-9a-f]+/i.test(c) || /^[0-9a-f]{6,}/i.test(c)) break
      if (/\[|\]|==|writable|rsp|rsi|rdx|rax|constraint/i.test(c)) constraints.push(c)
    }
    out.push(`${addr}${constraints.length ? ` constraints: ${constraints.slice(0, 3).join(" ; ")}` : ""}`)
    if (out.length >= 8) break
  }
  return out
}

export function parseOneGadgetCompact(text: string) {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!/^0x[0-9a-f]+/i.test(line) && !/^[0-9a-f]{6,}/i.test(line)) continue
    const addr = line.startsWith("0x") ? line.split(/\s+/)[0] : `0x${line.split(/\s+/)[0]}`
    out.push(addr)
    if (out.length >= 6) break
  }
  return out
}

export function hexOrUnknown(value: bigint | null) {
  return value === null ? "unknown" : `0x${value.toString(16)}`
}
