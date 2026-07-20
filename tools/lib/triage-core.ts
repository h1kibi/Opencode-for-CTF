import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { open } from "node:fs/promises"

export const SAMPLE_BYTES = 1024 * 1024

export function entropy(buf: Buffer) {
  if (buf.length === 0) return 0
  const counts = new Array(256).fill(0)
  for (const byte of buf) counts[byte]++
  let result = 0
  for (const count of counts) {
    if (!count) continue
    const p = count / buf.length
    result -= p * Math.log2(p)
  }
  return result
}

export function printableStrings(buf: Buffer, limit = 80) {
  const text = buf.toString("latin1")
  return Array.from(text.matchAll(/[ -~]{5,}/g), (m) => m[0]).slice(0, limit)
}

export function routeHints(name: string, buf: Buffer, strings: string[]) {
  const lower = name.toLowerCase()
  const joined = strings.join("\n").toLowerCase()
  const hints = new Set<string>()
  if (/https?:\/\//i.test(joined) || /<html|flask|django|express|php|cookie|jwt/.test(joined)) hints.add("web")
  if (
    /\.elf|\.so$|\.exe$|\.dll$/.test(lower) ||
    buf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    buf.subarray(0, 2).toString() === "MZ"
  )
    hints.add("pwn/rev")
  if (/rsa|ecc|aes|nonce|cipher|encrypt|decrypt|modulus|private key|public key/.test(joined)) hints.add("crypto")
  if (/\.pcap|\.pcapng|\.mem|\.raw|\.vmdk|\.img|\.docx|\.pdf|\.png|\.jpg|\.wav|\.zip|\.7z|\.rar/.test(lower))
    hints.add("forensics")
  if (/jail|sandbox|game|blockchain|solidity|wasm|protobuf/.test(joined)) hints.add("misc")
  return Array.from(hints)
}

export async function sha256File(target: string) {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(target)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve())
    stream.on("error", reject)
  })
  return hash.digest("hex")
}

export async function readSample(target: string, maxBytes = SAMPLE_BYTES) {
  const fd = await open(target, "r")
  try {
    const buf = Buffer.alloc(maxBytes)
    const { bytesRead } = await fd.read(buf, 0, maxBytes, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fd.close()
  }
}

export function magicHex(sample: Buffer, byteCount = 32) {
  return (
    sample
      .subarray(0, byteCount)
      .toString("hex")
      .match(/.{1,2}/g)
      ?.join(" ") ?? ""
  )
}

export function extractNetworkHints(strings: string[]) {
  const joined = strings.join("\n")
  const urls = Array.from(new Set(joined.match(/https?:\/\/[^\s"'<>]+/g) ?? [])).slice(0, 30)
  const emails = Array.from(new Set(joined.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])).slice(0, 30)
  const ips = Array.from(new Set(joined.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])).slice(0, 30)
  return { urls, emails, ips }
}
