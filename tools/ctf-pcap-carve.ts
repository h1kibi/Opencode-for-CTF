import { tool } from "@opencode-ai/plugin"
import { lstat, open, readFile } from "node:fs/promises"
import { createDecipheriv, createCipheriv } from "node:crypto"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`target must stay inside the current workspace: ${input}`)
  }
  return target
}

function decodeHexOrAscii(input: string): Buffer {
  const v = input.trim()
  if (v.startsWith("0x") || v.startsWith("0X")) {
    return Buffer.from(v.slice(2).replace(/\s+/g, ""), "hex")
  }
  if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0 && v.length >= 2) {
    return Buffer.from(v, "hex")
  }
  return Buffer.from(v, "latin1")
}

function xorBytes(data: Buffer, key: Buffer) {
  if (!key.length) return data
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length]
  }
  return out
}

function xorSingleByte(data: Buffer, byte: number) {
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ byte
  return out
}

function xorPositional(data: Buffer, key: Buffer) {
  // key[i] XOR data[i] XOR i,常见 CTF 自定义
  if (!key.length) return data
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length] ^ (i & 0xff)
  }
  return out
}

// RC4 实现
function rc4(data: Buffer, key: Buffer) {
  if (!key.length) return data
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff
    const tmp = s[i]
    s[i] = s[j]
    s[j] = tmp
  }
  const out = Buffer.allocUnsafe(data.length)
  let i = 0
  j = 0
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    const tmp = s[i]
    s[i] = s[j]
    s[j] = tmp
    out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff]
  }
  return out
}

function aesEcbDecrypt(data: Buffer, key: Buffer) {
  if (![16, 24, 32].includes(key.length)) throw new Error(`aes_ecb requires 16/24/32-byte key, got ${key.length}`)
  const algo = `aes-${key.length * 8}-ecb`
  const d = createDecipheriv(algo, key, null as unknown as Buffer)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(data), d.final()])
}

function aesCbcDecrypt(data: Buffer, key: Buffer, iv: Buffer) {
  if (![16, 24, 32].includes(key.length)) throw new Error(`aes_cbc requires 16/24/32-byte key, got ${key.length}`)
  if (iv.length !== 16) throw new Error(`aes_cbc requires 16-byte IV, got ${iv.length}`)
  const algo = `aes-${key.length * 8}-cbc`
  const d = createDecipheriv(algo, key, iv)
  d.setAutoPadding(false)
  return Buffer.concat([d.update(data), d.final()])
}

function aesCtrDecrypt(data: Buffer, key: Buffer, iv: Buffer) {
  if (![16, 24, 32].includes(key.length)) throw new Error(`aes_ctr requires 16/24/32-byte key, got ${key.length}`)
  if (iv.length !== 16) throw new Error(`aes_ctr requires 16-byte IV/counter, got ${iv.length}`)
  const algo = `aes-${key.length * 8}-ctr`
  const d = createDecipheriv(algo, key, iv)
  return Buffer.concat([d.update(data), d.final()])
}

function aesGcmDecrypt(data: Buffer, key: Buffer, iv: Buffer) {
  if (![16, 24, 32].includes(key.length)) throw new Error(`aes_gcm requires 16/24/32-byte key, got ${key.length}`)
  if (iv.length < 12) throw new Error(`aes_gcm requires >=12-byte IV, got ${iv.length}`)
  // CTF 帧格式常见: 数据 || 16B tag 末尾拼接
  // 如果数据 >= 16 字节,默认取最后 16 字节作为 tag
  if (data.length < 16) throw new Error("aes_gcm requires at least 16 bytes (tag)")
  const algo = `aes-${key.length * 8}-gcm`
  const ciphertext = data.subarray(0, data.length - 16)
  const tag = data.subarray(data.length - 16)
  const d = createDecipheriv(algo, key, iv) as ReturnType<typeof createDecipheriv> & { setAuthTag: (t: Buffer) => void }
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(ciphertext), d.final()])
  } catch {
    // tag 验证失败通常意味着 IV/key 不匹配,但仍返回部分解密结果给分析者看
    return ciphertext
  }
}

function chacha20Decrypt(data: Buffer, key: Buffer, iv: Buffer) {
  if (key.length !== 32) throw new Error(`chacha20_poly1305 requires 32-byte key, got ${key.length}`)
  if (iv.length !== 12) throw new Error(`chacha20_poly1305 requires 12-byte nonce, got ${iv.length}`)
  // 数据 || 16B tag (RFC 8439 §2.8 AEAD)
  if (data.length < 16) throw new Error("chacha20_poly1305 requires at least 16 bytes (tag)")
  const ciphertext = data.subarray(0, data.length - 16)
  const tag = data.subarray(data.length - 16)
  const d = createDecipheriv("chacha20-poly1305", key, iv) as ReturnType<typeof createDecipheriv> & {
    setAuthTag: (t: Buffer) => void
  }
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(ciphertext), d.final()])
  } catch {
    return ciphertext
  }
}

function applyCipher(data: Buffer, cipher: string, key: Buffer, iv: Buffer) {
  switch (cipher) {
    case "none":
      return data
    case "xor_byte":
      return xorSingleByte(data, key.length ? key[0] : 0)
    case "xor_key":
      return xorBytes(data, key)
    case "xor_positional":
      return xorPositional(data, key)
    case "rc4":
      return rc4(data, key)
    case "aes_ecb":
      return aesEcbDecrypt(data, key)
    case "aes_cbc":
      return aesCbcDecrypt(data, key, iv)
    case "aes_ctr":
      return aesCtrDecrypt(data, key, iv)
    case "aes_gcm":
      return aesGcmDecrypt(data, key, iv)
    case "chacha20_poly1305":
      return chacha20Decrypt(data, key, iv)
    default:
      return data
  }
}

function asciiPreview(buf: Buffer, maxLen = 96) {
  const slice = buf.subarray(0, Math.min(buf.length, maxLen))
  let out = ""
  for (const b of slice) out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."
  return out
}

function findMagicOccurrences(buf: Buffer, magic: Buffer, maxHits = 2000) {
  const hits: number[] = []
  if (!magic.length) return hits
  let from = 0
  while (hits.length < maxHits) {
    const idx = buf.indexOf(magic, from)
    if (idx < 0) break
    hits.push(idx)
    from = idx + 1
  }
  return hits
}

function readLength(buf: Buffer, off: number, size: number, endian: "little" | "big") {
  if (size === 0) return 0
  if (off + size > buf.length) return -1
  if (size === 1) return buf[off]
  if (size === 2) return endian === "little" ? buf.readUInt16LE(off) : buf.readUInt16BE(off)
  if (size === 4) return endian === "little" ? buf.readUInt32LE(off) : buf.readUInt32BE(off)
  return -1
}

// 简化的 pcap 文件头解析,只支持 libpcap 1.0 经典格式(magic 0xa1b2c3d4 / 0xd4c3b2a1)
function parsePcapIfPresent(buf: Buffer): {
  isPcap: boolean
  packets: Array<{ offset: number; payload: Buffer; tsSec: number; tsUsec: number; origLen: number }>
} {
  if (buf.length < 24) return { isPcap: false, packets: [] }
  const m0 = buf.readUInt32BE(0)
  const m1 = buf.readUInt32LE(0)
  if (m0 !== 0xa1b2c3d4 && m0 !== 0xa1b2cd34 && m1 !== 0xa1b2c3d4 && m1 !== 0xa1b2cd34) {
    return { isPcap: false, packets: [] }
  }
  const littleEndian = m1 === 0xa1b2c3d4 || m1 === 0xa1b2cd34
  const rd16 = (off: number) => (littleEndian ? buf.readUInt16LE(off) : buf.readUInt16BE(off))
  const rd32 = (off: number) => (littleEndian ? buf.readUInt32LE(off) : buf.readUInt32BE(off))
  const snapLen = rd32(16)
  const linkType = rd32(20)
  const packets: Array<{ offset: number; payload: Buffer; tsSec: number; tsUsec: number; origLen: number }> = []
  let off = 24
  let count = 0
  while (off + 16 <= buf.length && count < 200000) {
    const tsSec = rd32(off)
    const tsUsec = rd32(off + 4)
    const inclLen = rd32(off + 8)
    const origLen = rd32(off + 12)
    if (inclLen > snapLen + 64 || inclLen > buf.length - off - 16) break
    const payload = buf.subarray(off + 16, off + 16 + inclLen)
    packets.push({ offset: off + 16, payload, tsSec, tsUsec, origLen })
    off += 16 + inclLen
    count++
  }
  return { isPcap: true, packets }
}

// 跳过常见 L2/L3/L4 头部以逼近应用层 payload
function extractAppLayer(payload: Buffer, linkType: number): Buffer {
  let off = 0
  if (linkType === 1 && payload.length >= 14) {
    // Ethernet
    const ethType = payload.readUInt16BE(12)
    off = 14
    if (ethType === 0x0800 && payload.length >= off + 20) {
      // IPv4
      const ihl = (payload[off] & 0x0f) * 4
      const proto = payload[off + 9]
      off += ihl
      if (proto === 6 && payload.length >= off + 20) {
        // TCP
        const dataOff = ((payload[off + 12] >> 4) & 0xf) * 4
        off += dataOff
      } else if (proto === 17 && payload.length >= off + 8) {
        // UDP
        off += 8
      }
    } else if (ethType === 0x86dd && payload.length >= off + 40) {
      // IPv6
      const nextHdr = payload[off + 6]
      off += 40
      if (nextHdr === 6 && payload.length >= off + 20) {
        const dataOff = ((payload[off + 12] >> 4) & 0xf) * 4
        off += dataOff
      } else if (nextHdr === 17 && payload.length >= off + 8) {
        off += 8
      }
    }
  } else if (linkType === 101 && payload.length >= 4) {
    // Raw IP
    const ihl = (payload[0] & 0x0f) * 4
    off = ihl
  }
  return off > 0 && off < payload.length ? payload.subarray(off) : payload
}

type CarvedFrame = {
  packetIndex: number
  frameIndex: number
  magicOffset: number
  length: number
  rawHex: string
  decryptedHex: string
  asciiPreview: string
  decryptedAscii: string
  isFlagLike: boolean
  cipherError?: string
}

const FLAG_RE = /[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}/g

export default tool({
  description:
    "CTF pcap carve: extract custom-protocol frames by magic + length-prefix from pcap or raw stream, apply batch decryption (xor_byte/xor_key/xor_positional/rc4), and flag-scan results.",
  args: {
    target: tool.schema.string().describe("pcap/pcapng/raw bytes file path"),
    magic: tool.schema
      .string()
      .optional()
      .describe("Magic marker as ASCII (e.g. ET3RNUMX) or hex (0x4554...). Required unless mode=auto."),
    lengthSize: tool.schema
      .number()
      .optional()
      .describe("Length field size in bytes after magic. 0/1/2/4. Default 0 (split at next magic)."),
    lengthEndian: tool.schema.string().optional().describe("little | big. Default big."),
    lengthOffset: tool.schema.number().optional().describe("Bytes between magic end and length field. Default 0."),
    lengthIncludesMagic: tool.schema
      .boolean()
      .optional()
      .describe("Whether length field counts magic bytes. Default false."),
    cipher: tool.schema
      .string()
      .optional()
      .describe(
        "none | xor_byte | xor_key | xor_positional | rc4 | aes_ecb | aes_cbc | aes_ctr | aes_gcm | chacha20_poly1305. Default none.",
      ),
    key: tool.schema.string().optional().describe("Cipher key as ASCII or hex (0x...). Required for keyed ciphers."),
    iv: tool.schema
      .string()
      .optional()
      .describe(
        "IV/nonce as ASCII or hex (0x...). Required for aes_cbc(16B) / aes_ctr(16B) / aes_gcm(>=12B) / chacha20_poly1305(12B).",
      ),
    scanAppLayerOnly: tool.schema
      .boolean()
      .optional()
      .describe("If pcap detected, only carve application-layer payloads. Default true."),
    minFrameSize: tool.schema.number().optional().describe("Minimum frame payload size (excluding magic). Default 1."),
    maxFrameSize: tool.schema.number().optional().describe("Maximum frame payload size. Default 4096."),
    maxFrames: tool.schema.number().optional().describe("Maximum frames to carve. Default 200."),
    autoTryXorBytes: tool.schema
      .boolean()
      .optional()
      .describe(
        "When cipher=none, also try all 256 single-byte XOR variants and report flag-like hits. Default false.",
      ),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const buf = await readFile(target)

    const magic = args.magic ? decodeHexOrAscii(args.magic) : Buffer.alloc(0)
    const lengthSize = Math.max(0, Math.min(4, args.lengthSize ?? 0))
    const lengthEndian = (args.lengthEndian ?? "big") === "little" ? "little" : "big"
    const lengthOffset = Math.max(0, args.lengthOffset ?? 0)
    const lengthIncludesMagic = args.lengthIncludesMagic ?? false
    const cipher = (args.cipher ?? "none") as string
    const key = args.key ? decodeHexOrAscii(args.key) : Buffer.alloc(0)
    const iv = args.iv ? decodeHexOrAscii(args.iv) : Buffer.alloc(0)
    const scanAppLayerOnly = args.scanAppLayerOnly ?? true
    const minFrameSize = Math.max(1, args.minFrameSize ?? 1)
    const maxFrameSize = Math.max(16, Math.min(65535, args.maxFrameSize ?? 4096))
    const maxFrames = Math.max(1, Math.min(5000, args.maxFrames ?? 200))
    const autoTryXorBytes = args.autoTryXorBytes ?? false

    const { isPcap, packets } = parsePcapIfPresent(buf)
    const linkType = isPcap ? buf.readUInt32LE(20) : 0

    // 候选 buffers: 整文件 + 每包应用层(如果是 pcap)
    type Candidate = { source: string; data: Buffer }
    const candidates: Candidate[] = []
    if (isPcap && scanAppLayerOnly) {
      packets.forEach((p, i) => {
        const app = extractAppLayer(p.payload, linkType)
        if (app.length >= 1) candidates.push({ source: `packet#${i}`, data: app })
      })
      // 同时保留整文件作为兜底,但单独标记
      candidates.push({ source: "whole_file", data: buf })
    } else {
      candidates.push({ source: isPcap ? "whole_pcap_bytes" : "raw_bytes", data: buf })
    }

    const frames: CarvedFrame[] = []
    let frameIndex = 0
    const seenOffsets = new Set<number>()

    for (const cand of candidates) {
      if (frameIndex >= maxFrames) break
      const occurrences = findMagicOccurrences(cand.data, magic, maxFrames * 2)
      for (let i = 0; i < occurrences.length && frameIndex < maxFrames; i++) {
        const start = occurrences[i]
        const lengthFieldOff = start + magic.length + lengthOffset
        let frameLen = 0
        let bodyStart = start + magic.length
        if (lengthSize > 0) {
          const v = readLength(cand.data, lengthFieldOff, lengthSize, lengthEndian)
          if (v < 0) continue
          frameLen = lengthIncludesMagic ? v - magic.length : v
          bodyStart = lengthFieldOff + lengthSize
          if (frameLen < minFrameSize || frameLen > maxFrameSize) continue
        } else {
          // 按 next magic 切
          const nextStart = i + 1 < occurrences.length ? occurrences[i + 1] : cand.data.length
          frameLen = nextStart - bodyStart
          if (frameLen < minFrameSize) continue
          frameLen = Math.min(frameLen, maxFrameSize)
        }
        const body = cand.data.subarray(bodyStart, bodyStart + frameLen)
        if (!body.length) continue
        // 全局去重(whole_file 与 packet 可能重复)
        const dedupKey = start * 100003 + cand.data.length
        if (seenOffsets.has(dedupKey)) continue
        seenOffsets.add(dedupKey)

        let decrypted = body
        let cipherError = ""
        try {
          decrypted = applyCipher(body, cipher, key, iv)
        } catch (err) {
          cipherError = (err as Error).message || String(err)
        }
        const asciiRaw = asciiPreview(body)
        const asciiDec = asciiPreview(decrypted)
        const flagMatchRaw = body.toString("latin1").match(FLAG_RE)
        const flagMatchDec = decrypted.toString("latin1").match(FLAG_RE)
        frames.push({
          packetIndex: cand.source.startsWith("packet#") ? Number(cand.source.slice(8)) : -1,
          frameIndex,
          magicOffset: start,
          length: frameLen,
          rawHex: body.subarray(0, Math.min(body.length, 128)).toString("hex"),
          decryptedHex: decrypted.subarray(0, Math.min(decrypted.length, 128)).toString("hex"),
          asciiPreview: asciiRaw,
          decryptedAscii: asciiDec,
          isFlagLike: !!(flagMatchRaw || flagMatchDec),
          cipherError: cipherError || undefined,
        })
        frameIndex++
      }
    }

    // autoTryXorBytes: 找 flag-like 命中
    const xorByteHits: Array<{ frameIndex: number; byte: number; ascii: string; flagLike: boolean }> = []
    if (autoTryXorBytes && cipher === "none") {
      for (const f of frames.slice(0, Math.min(frames.length, 50))) {
        const body = Buffer.from(f.rawHex, "hex")
        for (let b = 0; b < 256; b++) {
          const dec = xorSingleByte(body, b)
          const s = dec.toString("latin1")
          if (FLAG_RE.test(s) || /flag|secret|password|token/i.test(s)) {
            xorByteHits.push({
              frameIndex: f.frameIndex,
              byte: b,
              ascii: asciiPreview(dec, 200),
              flagLike: FLAG_RE.test(s),
            })
          }
        }
      }
    }

    const flagCandidates = frames.filter((f) => f.isFlagLike).slice(0, 50)
    const payload = {
      schema_version: "pcap_carve.v1",
      target,
      size: st.size,
      is_pcap: isPcap,
      pcap_link_type: isPcap ? linkType : null,
      pcap_packet_count: isPcap ? packets.length : 0,
      magic_ascii: magic.toString("latin1"),
      magic_hex: magic.toString("hex"),
      length_size: lengthSize,
      length_endian: lengthEndian,
      length_offset: lengthOffset,
      length_includes_magic: lengthIncludesMagic,
      cipher,
      key_provided: !!key.length,
      candidates_scanned: candidates.length,
      frames_carved: frames.length,
      frames: frames.slice(0, maxFrames),
      flag_candidates: flagCandidates,
      xor_byte_auto_hits: xorByteHits,
      recommended_next: [] as string[],
    }

    if (flagCandidates.length)
      payload.recommended_next.push(
        `verify flag-like hits: ${flagCandidates
          .map((f) => `frame#${f.frameIndex}`)
          .slice(0, 5)
          .join(", ")}`,
      )
    if (xorByteHits.length)
      payload.recommended_next.push(
        `try xor_byte variants; first hit frame#${xorByteHits[0].frameIndex} byte=0x${xorByteHits[0].byte.toString(16)}`,
      )
    if (!frames.length)
      payload.recommended_next.push(
        `no frames carved with magic='${magic.toString("latin1")}'; try mode=auto with common magics (PK, ET3RNUMX, FLAG{, etc.) or set scanAppLayerOnly=false`,
      )
    const cipherErrors = frames.filter((f) => f.cipherError).map((f) => `frame#${f.frameIndex}: ${f.cipherError}`)
    if (cipherErrors.length)
      payload.recommended_next.push(`cipher errors on ${cipherErrors.length} frames: ${cipherErrors[0]}`)
    if (!payload.recommended_next.length)
      payload.recommended_next.push(
        "inspect carved frames and verify cipher/key against the protocol spec or success/failure oracle",
      )

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pcap_carve:",
      `- schema_version: ${payload.schema_version}`,
      `- target: ${target}`,
      `- size: ${st.size}`,
      `- is_pcap: ${isPcap}`,
      `- pcap_link_type: ${isPcap ? linkType : "n/a"}`,
      `- pcap_packet_count: ${isPcap ? packets.length : 0}`,
      `- magic_ascii: ${magic.toString("latin1") || "(none)"}`,
      `- magic_hex: ${magic.toString("hex") || "(none)"}`,
      `- length_size: ${lengthSize}`,
      `- length_endian: ${lengthEndian}`,
      `- length_offset: ${lengthOffset}`,
      `- length_includes_magic: ${lengthIncludesMagic}`,
      `- cipher: ${cipher}`,
      `- key_provided: ${!!key.length}`,
      `- candidates_scanned: ${candidates.length}`,
      `- frames_carved: ${frames.length}`,
      "frames (first 50):",
      ...(frames.length
        ? frames
            .slice(0, 50)
            .map(
              (f) =>
                `- frame#${f.frameIndex} src=${f.packetIndex >= 0 ? `pkt#${f.packetIndex}` : "whole"} off=${f.magicOffset} len=${f.length}\n   raw_hex=${f.rawHex.slice(0, 96)}...\n   dec_hex=${f.decryptedHex.slice(0, 96)}...\n   dec_ascii=${f.decryptedAscii}\n   flag_like=${f.isFlagLike}`,
            )
        : ["- none"]),
      "flag_candidates:",
      ...(flagCandidates.length
        ? flagCandidates.map((f) => `- frame#${f.frameIndex} ascii=${f.decryptedAscii}`)
        : ["- none"]),
      "xor_byte_auto_hits:",
      ...(xorByteHits.length
        ? xorByteHits
            .slice(0, 30)
            .map(
              (h) => `- frame#${h.frameIndex} byte=0x${h.byte.toString(16)} ascii=${h.ascii} flag_like=${h.flagLike}`,
            )
        : ["- none"]),
      "recommended_next:",
      ...payload.recommended_next.map((x) => `- ${x}`),
    ].join("\n")
  },
})
