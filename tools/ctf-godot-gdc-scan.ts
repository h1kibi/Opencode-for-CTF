import { tool } from "@opencode-ai/plugin"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

function resolveInsideWorkspace(contextDir: string, input: string) {
  const base = path.resolve(contextDir)
  const target = path.resolve(base, input)
  const rel = path.relative(base, target)
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path must stay inside current workspace: ${input}`)
  return target
}

function printableStrings(buf: Buffer, min = 4, max = 500) {
  const text = buf.toString("latin1")
  const matches = Array.from(text.matchAll(new RegExp(`[ -~]{${min},}`, "g")), (m) => m[0])
  return [...new Set(matches)].slice(0, max)
}

function classify(strings: string[]) {
  return {
    flagLike: strings.filter((s) => /flag|ctf|secret|password|token/i.test(s)).slice(0, 30),
    functionLike: strings.filter((s) => /^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(s)).slice(0, 60),
    cryptoLike: strings.filter((s) => /sha|md5|base64|xor|encrypt|decrypt|hash/i.test(s)).slice(0, 30),
    resourceLike: strings.filter((s) => /res:\/\/|load\(|preload\(|\.tscn|\.tres|\.png|\.ogg/i.test(s)).slice(0, 30),
  }
}

export default tool({
  description:
    "CTF Godot GDC scan: extract high-signal printable strings from .gdc and group likely flag/function/crypto/resource clues before full decompilation.",
  args: {
    target: tool.schema.string().describe("Workspace-relative .gdc/.gd/.gde file."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const target = resolveInsideWorkspace(context.directory, args.target)
    const st = await lstat(target)
    if (!st.isFile()) throw new Error("target must be a file")
    const buf = await readFile(target)
    const strings = printableStrings(buf)
    const grouped = classify(strings)
    const payload = {
      target,
      size: st.size,
      stringCount: strings.length,
      grouped,
      nextProbe:
        grouped.flagLike.length || grouped.cryptoLike.length
          ? "Use the grouped strings to choose the hottest script for gdre_tools decompile or targeted grep after recovery."
          : "If strings are sparse, recover/extract the wider project and correlate .gdc with .tscn/.tres references.",
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "CTF_GODOT_GDC_SCAN:",
      `- target: ${target}`,
      `- size: ${st.size}`,
      `- string_count: ${strings.length}`,
      "- flag_like:",
      ...grouped.flagLike.map((s) => `  ${s}`),
      "- function_like:",
      ...grouped.functionLike.slice(0, 20).map((s) => `  ${s}`),
      "- crypto_like:",
      ...grouped.cryptoLike.map((s) => `  ${s}`),
      "- resource_like:",
      ...grouped.resourceLike.map((s) => `  ${s}`),
      `- next_probe: ${payload.nextProbe}`,
    ].join("\n")
  },
})
