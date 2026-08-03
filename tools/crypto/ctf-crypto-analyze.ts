import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import { resolveAllowedPath } from "../lib/path-policy.ts"
import rsaProbe from "./ctf-rsa-probe.ts"

type Primitive =
  "rsa" | "ecc" | "symmetric" | "stream" | "prng" | "hash-mac-signature" | "classical-encoding" | "unknown"

function readInputPreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500)
}

function countMatches(text: string, re: RegExp) {
  return Array.from(text.matchAll(re)).length
}

function classify(
  text: string,
  forced?: string,
): { primitive: Primitive; reason: string; confidence: "high" | "medium" | "low" } {
  const mode = (forced ?? "auto").toLowerCase()
  const allowed: Primitive[] = [
    "rsa",
    "ecc",
    "symmetric",
    "stream",
    "prng",
    "hash-mac-signature",
    "classical-encoding",
    "unknown",
  ]
  if (allowed.includes(mode as Primitive))
    return { primitive: mode as Primitive, reason: `forced:${mode}`, confidence: "high" }

  const rsaAssignments = countMatches(text, /\b(n|e|c|p|q|d|dp|dq|phi)\b\s*[:=]\s*(0x[0-9a-fA-F]+|\d+)/g)
  const lower = text.toLowerCase()
  if (
    rsaAssignments >= 3 ||
    (/\brsa\b|modulus|public exponent|private exponent|ciphertext/.test(lower) && rsaAssignments >= 1)
  ) {
    return {
      primitive: "rsa",
      reason: `rsa parameter assignments=${rsaAssignments}`,
      confidence: rsaAssignments >= 3 ? "high" : "medium",
    }
  }
  if (/\becc\b|elliptic|curve25519|secp|p-256|ecdsa|nonce reuse|invalid curve/.test(lower)) {
    return { primitive: "ecc", reason: "ECC/signature/curve keywords", confidence: "medium" }
  }
  if (/\baes\b|\bdes\b|\bcbc\b|\bctr\b|\bgcm\b|\becb\b|padding oracle|iv\s*[:=]|nonce\s*[:=]/.test(lower)) {
    return { primitive: "symmetric", reason: "block mode, IV, nonce, or padding evidence", confidence: "medium" }
  }
  if (/xor|keystream|rc4|chacha|salsa|stream cipher|reused key|known plaintext/.test(lower)) {
    return { primitive: "stream", reason: "stream/reused-keystream keywords", confidence: "medium" }
  }
  if (/mt19937|mersenne|lcg|xorshift|rand\(|srand|seed|prng|random/.test(lower)) {
    return { primitive: "prng", reason: "PRNG/seed/state keywords", confidence: "medium" }
  }
  if (/sha1|sha256|md5|hmac|mac|signature|length extension|hashpump|ecdsa|dsa/.test(lower)) {
    return { primitive: "hash-mac-signature", reason: "hash, MAC, or signature keywords", confidence: "medium" }
  }
  if (/base64|base32|hex|rot13|caesar|vigenere|substitution|transposition|morse|rail fence|atbash/.test(lower)) {
    return { primitive: "classical-encoding", reason: "classical/encoding keywords", confidence: "medium" }
  }
  return { primitive: "unknown", reason: "no crypto primitive signal dominated", confidence: "low" }
}

function inventory(text: string) {
  return {
    decimalIntegers: countMatches(text, /\b\d{5,}\b/g),
    hexBlobs: countMatches(text, /\b(?:0x)?[0-9a-fA-F]{16,}\b/g),
    base64Like: countMatches(text, /\b[A-Za-z0-9+/]{24,}={0,2}\b/g),
    assignmentKeys: Array.from(
      new Set(Array.from(text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{0,24})\b\s*[:=]/g), (m) => m[1])),
    ).slice(0, 30),
  }
}

function nextHint(primitive: Primitive) {
  switch (primitive) {
    case "rsa":
      return "Use the delegated RSA probe output to choose small exponent, shared-prime, CRT leak, factor, common modulus, or padding-misuse tests before manual attacks."
    case "ecc":
      return "Inventory curve parameters, group/order, public points, signatures, and nonce reuse before Sage or lattice work."
    case "symmetric":
      return "Normalize key/IV/nonce/ciphertext, then test mode misuse: ECB patterns, nonce reuse, CBC bit flip, padding oracle, and MAC/encrypt order."
    case "stream":
      return "Look for repeated keystream, known plaintext, state leaks, or biased output before brute force."
    case "prng":
      return "Record output count, modulus, seed source, and truncation; prove state recovery bounds before coding."
    case "hash-mac-signature":
      return "Separate hash, MAC, and signature cases; test length extension, truncation, nonce reuse, and weak comparison only with parameter evidence."
    case "classical-encoding":
      return "Try reversible transforms in a bounded chain and stop when entropy or flag-format evidence stops improving."
    default:
      return "Load the crypto reference index, classify the primitive from parameters/source/oracle behavior, and pivot if the dominant evidence is not cryptanalytic."
  }
}

export default tool({
  description:
    "CTF crypto analysis facade: stable first-pass entrypoint for parameter inventory and primitive routing. Delegates to ctf-rsa-probe for RSA-shaped inputs and emits bounded next steps for other crypto families.",
  args: {
    input: tool.schema.string().describe("Path to a text file, or raw crypto challenge text/parameters."),
    primitive: tool.schema
      .string()
      .optional()
      .describe(
        "auto | rsa | ecc | symmetric | stream | prng | hash-mac-signature | classical-encoding | unknown. Default auto.",
      ),
    runRsaProbe: tool.schema.boolean().optional().describe("Run ctf-rsa-probe when route is RSA. Default true."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    let text = args.input
    let inputKind = "raw"
    try {
      const target = await resolveAllowedPath(args.input, context)
      text = await readFile(target, "utf8")
      inputKind = "file"
    } catch (error) {
      if (/[\\/]/.test(args.input) || /\.[A-Za-z0-9]{1,8}$/.test(args.input.trim())) throw error
    }

    const decision = classify(text, args.primitive)
    const inv = inventory(text)
    const rsa =
      decision.primitive === "rsa" && args.runRsaProbe !== false
        ? await rsaProbe.execute({ input: args.input }, context as never)
        : null
    const skipped = [
      ...(decision.primitive === "rsa" && args.runRsaProbe === false ? ["rsa_probe_skipped: runRsaProbe=false"] : []),
      ...(decision.primitive !== "rsa" ? ["rsa_probe_skipped: route is not RSA-shaped"] : []),
    ]
    const payload = {
      schemaVersion: "crypto_analyze.v1",
      inputKind,
      primitive: decision.primitive,
      confidence: decision.confidence,
      routeReason: decision.reason,
      inventory: inv,
      rsaProbe: rsa,
      nextToolHint: nextHint(decision.primitive),
      stopIf:
        "Do not brute force or launch heavy math until parameters, bounds, and a falsifiable weakness are explicit.",
      preview: readInputPreview(text),
      skipped,
    }

    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_CRYPTO_ANALYZE:",
      `- input_kind: ${payload.inputKind}`,
      `- primitive: ${payload.primitive}`,
      `- confidence: ${payload.confidence}`,
      `- route_reason: ${payload.routeReason}`,
      `- inventory: decimal_integers=${inv.decimalIntegers} hex_blobs=${inv.hexBlobs} base64_like=${inv.base64Like}`,
      `- assignment_keys: ${inv.assignmentKeys.length ? inv.assignmentKeys.join(", ") : "none"}`,
      `- next_tool_hint: ${payload.nextToolHint}`,
      `- stop_if: ${payload.stopIf}`,
      "- rsa_probe:",
      rsa
        ? String(rsa)
            .split(/\r?\n/)
            .map((line) => `  ${line}`)
            .join("\n")
        : "  skipped",
      "- skipped:",
      ...skipped.map((line) => `  ${line}`),
    ].join("\n")
  },
})
