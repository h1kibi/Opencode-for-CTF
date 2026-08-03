import { tool } from "@opencode-ai/plugin"

function linesBySection(text: string) {
  const sections: Record<string, string[]> = { all: [] }
  let current = "all"
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim()
    const heading = line.match(/^(#+\s+.+|[A-Za-z0-9 _./()-]{3,80}:)$/)
    if (heading) {
      current = heading[1]
        .replace(/^#+\s*/, "")
        .replace(/:$/, "")
        .trim()
        .toLowerCase()
      sections[current] = sections[current] || []
      continue
    }
    if (line) sections[current].push(line)
    sections.all.push(line)
  }
  return sections
}

function scoreOverlap(a: string, b: string) {
  const aa = a.toLowerCase()
  const bb = b.toLowerCase()
  let score = 0
  for (const token of [
    "heap",
    "uaf",
    "overlap",
    "fd",
    "bk",
    "size",
    "seccomp",
    "orw",
    "jmp rsp",
    "shellcode",
    "ret2libc",
    "flag",
    "closure",
    "glibc",
    "tcache",
  ]) {
    if (aa.includes(token) && bb.includes(token)) score += 2
  }
  return score
}

export default tool({
  description:
    "CTF PWN WP diff: compare a pasted WP excerpt with the current route notes and emit a compact structured diff of route, primitive, blocker, and shortest-closure differences.",
  args: {
    wpText: tool.schema.string().describe("Pasted writeup excerpt or extracted challenge-specific section."),
    currentText: tool.schema.string().describe("Current notes, handoff, route summary, or blocker summary."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const wp = linesBySection(args.wpText)
    const cur = linesBySection(args.currentText)
    const wpLines = wp.all.filter(Boolean)
    const curLines = cur.all.filter(Boolean)
    const shared = wpLines.filter((line) => curLines.some((x) => scoreOverlap(line, x) >= 2)).slice(0, 20)
    const wpOnly = wpLines.filter((line) => !curLines.some((x) => scoreOverlap(line, x) >= 2)).slice(0, 20)
    const curOnly = curLines.filter((line) => !wpLines.some((x) => scoreOverlap(line, x) >= 2)).slice(0, 20)
    const recommendations = [
      wpOnly.length
        ? "Promote only the smallest WP-only step that shortens the current closure path; do not import the whole chain blindly."
        : "Current route already overlaps strongly with the WP; focus on implementation details or runtime drift.",
      curOnly.length
        ? "Check whether current extra branches are genuinely shorter than the WP closure path or just harder side routes."
        : "No large current-only branch detected; compare runtime assumptions next.",
      "Extract one diff as a next probe: route, primitive, blocker, or closure owner — not all four at once.",
    ]
    const payload = {
      schema_version: "pwn_wp_diff.v1",
      shared,
      wp_only: wpOnly,
      current_only: curOnly,
      recommendations,
    }
    if (args.jsonOnly) return JSON.stringify(payload, null, 2)
    return [
      "pwn_wp_diff:",
      "shared_route_signals:",
      ...(shared.length ? shared.map((x) => `- ${x}`) : ["- none"]),
      "wp_only_signals:",
      ...(wpOnly.length ? wpOnly.map((x) => `- ${x}`) : ["- none"]),
      "current_only_signals:",
      ...(curOnly.length ? curOnly.map((x) => `- ${x}`) : ["- none"]),
      "recommendations:",
      ...recommendations.map((x) => `- ${x}`),
    ].join("\n")
  },
})
