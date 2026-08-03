export type MemoryStringEncoding = "ascii" | "utf16le" | "utf16be" | "both"

export type MemoryStringHit = {
  offset: number
  encoding: "ascii" | "utf16le" | "utf16be"
  text: string
  byteLength: number
}

function isAsciiPrintable(code: number) {
  return code >= 0x20 && code <= 0x7e
}

function isUtf16Printable(code: number) {
  return isAsciiPrintable(code) || (code >= 0xa0 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd)
}

function utf16ZeroDensity(buf: Buffer, hit: MemoryStringHit, littleEndian: boolean) {
  let zeros = 0
  let total = 0
  for (let off = hit.offset; off + 1 < hit.offset + hit.byteLength; off += 2) {
    total++
    if (littleEndian ? buf[off + 1] === 0 : buf[off] === 0) zeros++
  }
  return total ? zeros / total : 0
}

function pushRun(
  hits: MemoryStringHit[],
  encoding: MemoryStringHit["encoding"],
  startOffset: number,
  byteLength: number,
  values: number[],
  minLength: number,
) {
  if (values.length < minLength) return
  const maxUnits = 65536
  const kept = values.slice(0, maxUnits)
  let text: string
  if (encoding === "ascii") {
    text = Buffer.from(kept).toString("latin1")
  } else {
    const bytes = Buffer.alloc(kept.length * 2)
    for (let i = 0; i < kept.length; i++) bytes.writeUInt16LE(kept[i], i * 2)
    text = bytes.toString("utf16le")
  }
  if (values.length > maxUnits) text += " [...]"
  hits.push({
    offset: startOffset,
    encoding,
    text,
    byteLength,
  })
}

export function scanAsciiStrings(buf: Buffer, minLength = 4): MemoryStringHit[] {
  const hits: MemoryStringHit[] = []
  let runStart = -1
  const values: number[] = []
  for (let i = 0; i < buf.length; i++) {
    const code = buf[i]
    if (isAsciiPrintable(code)) {
      if (runStart < 0) runStart = i
      values.push(code)
      continue
    }
    if (runStart >= 0) {
      pushRun(hits, "ascii", runStart, i - runStart, values, minLength)
      runStart = -1
      values.length = 0
    }
  }
  if (runStart >= 0) pushRun(hits, "ascii", runStart, buf.length - runStart, values, minLength)
  return hits
}

export function scanUtf16Strings(buf: Buffer, littleEndian: boolean, minLength = 4): MemoryStringHit[] {
  const encoding: MemoryStringHit["encoding"] = littleEndian ? "utf16le" : "utf16be"
  const raw: MemoryStringHit[] = []
  for (const startOffset of [0, 1]) {
    const values: number[] = []
    let runStart = -1
    let runByteLength = 0
    for (let i = startOffset; i + 1 < buf.length; i += 2) {
      const code = littleEndian ? buf.readUInt16LE(i) : buf.readUInt16BE(i)
      if (isUtf16Printable(code)) {
        if (runStart < 0) runStart = i
        values.push(code)
        runByteLength += 2
        continue
      }
      if (runStart >= 0) {
        pushRun(raw, encoding, runStart, runByteLength, values, minLength)
        runStart = -1
        values.length = 0
        runByteLength = 0
      }
    }
    if (runStart >= 0) pushRun(raw, encoding, runStart, runByteLength, values, minLength)
  }

  raw.sort((a, b) => a.offset - b.offset || b.byteLength - a.byteLength)
  const hits: MemoryStringHit[] = []
  for (const hit of raw) {
    const previous = hits[hits.length - 1]
    if (previous && hit.offset >= previous.offset && hit.offset < previous.offset + previous.byteLength) {
      const previousDensity = utf16ZeroDensity(buf, previous, littleEndian)
      const hitDensity = utf16ZeroDensity(buf, hit, littleEndian)
      if (
        hit.byteLength > previous.byteLength ||
        (hit.byteLength === previous.byteLength && hitDensity > previousDensity)
      ) {
        hits[hits.length - 1] = hit
      }
      continue
    }
    hits.push(hit)
  }
  return hits
}

export function scanMemoryStrings(
  buf: Buffer,
  options: {
    encoding?: MemoryStringEncoding
    minLength?: number
    maxHits?: number
    pattern?: RegExp
  } = {},
): MemoryStringHit[] {
  const encoding = options.encoding ?? "both"
  const minLength = Math.max(2, options.minLength ?? 4)
  const maxHits = Math.max(1, options.maxHits ?? 500)
  const pattern = options.pattern
  const hits: MemoryStringHit[] = []
  const candidates =
    encoding === "ascii"
      ? scanAsciiStrings(buf, minLength)
      : encoding === "utf16le"
        ? scanUtf16Strings(buf, true, minLength)
        : encoding === "utf16be"
          ? scanUtf16Strings(buf, false, minLength)
          : [...scanAsciiStrings(buf, minLength), ...scanUtf16Strings(buf, true, minLength)]

  candidates.sort((a, b) => a.offset - b.offset || a.encoding.localeCompare(b.encoding))
  for (const hit of candidates) {
    if (!pattern || pattern.test(hit.text)) hits.push(hit)
    if (hits.length >= maxHits) break
  }
  return hits
}

export function sanitizeMemoryString(value: string): string {
  let out = ""
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp < 0x20 || cp === 0x7f) {
      out += `\\x${cp.toString(16).padStart(2, "0")}`
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      out += `\\u${cp.toString(16).padStart(4, "0")}`
    } else {
      out += ch
    }
  }
  return out
}

export function formatMemoryStringHit(hit: MemoryStringHit, fileLabel?: string): string {
  const where = fileLabel ? `${fileLabel}:` : ""
  return `${where}0x${hit.offset.toString(16)} ${hit.encoding} len=${hit.byteLength} ${sanitizeMemoryString(hit.text)}`
}
