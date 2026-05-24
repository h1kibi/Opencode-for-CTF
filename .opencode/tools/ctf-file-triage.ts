import { tool } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import path from "node:path"

const SAMPLE_BYTES = 1024 * 1024

function entropy(buf: Buffer) {
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

function printableStrings(buf: Buffer) {
  const text = buf.toString("latin1")
  return Array.from(text.matchAll(/[ -~]{5,}/g), (m) => m[0]).slice(0, 80)
}

function routeHints(name: string, buf: Buffer, strings: string[]) {
  const lower = name.toLowerCase()
  const joined = strings.join("\n").toLowerCase()
  const hints = new Set<string>()
  if (/https?:\/\//i.test(joined) || /<html|flask|django|express|php|cookie|jwt/.test(joined)) hints.add("web")
  if (/\.elf|\.so$|\.exe$|\.dll$/.test(lower) || buf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || buf.subarray(0, 2).toString() === "MZ") hints.add("pwn/rev")
  if (/rsa|ecc|aes|nonce|cipher|encrypt|decrypt|modulus|private key|public key/.test(joined)) hints.add("crypto")
  if (/\.pcap|\.pcapng|\.mem|\.raw|\.vmdk|\.img|\.docx|\.pdf|\.png|\.jpg|\.wav|\.zip|\.7z|\.rar/.test(lower)) hints.add("forensics")
  if (/jail|sandbox|game|blockchain|solidity|wasm|protobuf/.test(joined)) hints.add("misc")
  return Array.from(hints)
}

async function sha256File(target: string) {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(target)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve())
    stream.on("error", reject)
  })
  return hash.digest("hex")
}

async function readSample(target: string, maxBytes = SAMPLE_BYTES) {
  const fd = await open(target, "r")
  try {
    const buf = Buffer.alloc(maxBytes)
    const { bytesRead } = await fd.read(buf, 0, maxBytes, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fd.close()
  }
}

export default tool({
  description: "CTF file triage: report type hints, size, sha256, magic bytes, entropy, strings highlights, embedded URLs/emails/IPs, directory/archive listing hints, and likely CTF routing.",
  args: {
    target: tool.schema.string().describe("File or directory path to triage"),
  },
  async execute(args, context) {
    const target = path.resolve(context.directory, args.target)
    const stat = await lstat(target)
    if (stat.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true })
      return entries.slice(0, 200).map((entry) => `${entry.isDirectory() ? "dir " : "file"}\t${entry.name}`).join("\n")
    }

    const sample = await readSample(target)
    const strings = printableStrings(sample)
    const urls = Array.from(new Set(strings.join("\n").match(/https?:\/\/[^\s"'<>]+/g) ?? [])).slice(0, 30)
    const emails = Array.from(new Set(strings.join("\n").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])).slice(0, 30)
    const ips = Array.from(new Set(strings.join("\n").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])).slice(0, 30)
    const magic = sample.subarray(0, 32).toString("hex").match(/.{1,2}/g)?.join(" ") ?? ""
    const archiveLike = /\.(zip|7z|rar|tar|gz|bz2|xz|jar|apk|docx|xlsx|pptx)$/i.test(target)
    const hints = routeHints(target, sample, strings)

    return [
      `path: ${target}`,
      `size: ${stat.size}`,
      `sha256: ${await sha256File(target)}`,
      `sample_bytes: ${sample.length}`,
      `magic: ${magic}`,
      `entropy(sample): ${entropy(sample).toFixed(3)}`,
      `archive_like: ${archiveLike}`,
      `route_hints: ${hints.length ? hints.join(", ") : "none"}`,
      "urls:",
      ...urls.map((x) => `- ${x}`),
      "emails:",
      ...emails.map((x) => `- ${x}`),
      "ips:",
      ...ips.map((x) => `- ${x}`),
      "strings_highlights:",
      ...strings.slice(0, 40).map((x) => `- ${x}`),
    ].join("\n")
  },
})
