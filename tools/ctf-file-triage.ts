import { tool } from "@opencode-ai/plugin"
import { lstat, readdir } from "node:fs/promises"
import { resolveAllowedPath } from "./lib/path-policy.ts"
import { entropy, extractNetworkHints, magicHex, printableStrings, readSample, routeHints, sha256File } from "./lib/triage-core.ts"

export default tool({
  description:
    "CTF file triage: report type hints, size, sha256, magic bytes, entropy, strings highlights, embedded URLs/emails/IPs, directory/archive listing hints, and likely CTF routing.",
  args: {
    target: tool.schema.string().describe("File or directory path to triage"),
  },
  async execute(args, context) {
    const target = await resolveAllowedPath(args.target, context)
    const stat = await lstat(target)
    if (stat.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true })
      return entries
        .slice(0, 200)
        .map((entry) => `${entry.isDirectory() ? "dir " : "file"}\t${entry.name}`)
        .join("\n")
    }

    const sample = await readSample(target)
    const strings = printableStrings(sample)
    const { urls, emails, ips } = extractNetworkHints(strings)
    const magic = magicHex(sample)
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
