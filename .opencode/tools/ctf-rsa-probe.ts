import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"

function parseBigints(text: string) {
  const result: Record<string, bigint[]> = {}
  const re = /\b(n|e|c|p|q|d|dp|dq|phi)\b\s*[:=]\s*(0x[0-9a-fA-F]+|\d+)/g
  for (const [, key, raw] of text.matchAll(re)) {
    result[key] ??= []
    result[key].push(BigInt(raw))
  }
  return result
}

function bits(n: bigint) {
  return n === 0n ? 0 : n.toString(2).length
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}

export default tool({
  description: "CTF RSA probe: parse n/e/c-style integers from a file or raw text and report bit lengths, common weak public exponents, shared-prime GCDs, and obvious hints.",
  args: {
    input: tool.schema.string().describe("Path to a text file, or raw text containing RSA parameters"),
  },
  async execute(args, context) {
    let text = args.input
    try {
      text = await readFile(path.resolve(context.directory, args.input), "utf8")
    } catch {}

    const values = parseBigints(text)
    const lines: string[] = []
    for (const [key, nums] of Object.entries(values)) {
      lines.push(`${key}: count=${nums.length} bits=[${nums.map(bits).join(", ")}]`)
    }

    for (const e of values.e ?? []) {
      if ([3n, 5n, 17n, 257n, 65537n].includes(e)) lines.push(`public_exponent_hint: e=${e}`)
      if (e <= 17n) lines.push(`low_exponent_candidate: e=${e}; check Hastad/small-message/no-padding cases`)
    }

    const ns = values.n ?? []
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const g = gcd(ns[i], ns[j])
        if (g > 1n && g < ns[i] && g < ns[j]) lines.push(`shared_prime: n[${i}] and n[${j}] gcd=${g}`)
      }
    }

    if (values.dp?.length || values.dq?.length) lines.push("leaked_crt_exponent_hint: try recovering p/q from dp/dq")
    if (values.p?.length || values.q?.length) lines.push("factor_hint: p/q present; reconstruct private key directly")
    return lines.length ? lines.join("\n") : "no RSA-style assignments found"
  },
})
