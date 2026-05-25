import { tool } from "@opencode-ai/plugin"

const reloadablePatterns = [
  /\.(jsp|asp|php|aspx|rb|py|pl|cgi|fcgi)$/i,
  /\.(html|htm|js|css|json|xml|yaml|yml|env|properties|conf|cfg|ini|toml|sh|bat|cmd)$/i,
  /template/i,
  /view/i,
  /partial/i,
  /layout/i,
  /header|footer/i,
  /config/i,
  /WEB-INF/i,
  /META-INF/i,
  /\.(jar|war|ear)$/i,
  /\.(class|dll|so|dylib)$/i,
]

const riskCategories: Record<string, string> = {
  java: "server restart / classloader reload",
  node: "process restart / watch reload",
  php: "per-request reload (immediate)",
  python: "process restart / auto-reload",
  ruby: "process restart / auto-reload",
  go: "recompile + restart",
  static: "immediate serve on next request",
}

function guessRuntime(path: string) {
  const l = path.toLowerCase()
  if (l.endsWith(".jsp") || l.endsWith(".java") || l.includes("web-inf")) return "java"
  if (l.endsWith(".js") || l.includes("node_modules")) return "node"
  if (l.endsWith(".php")) return "php"
  if (l.endsWith(".py")) return "python"
  if (l.endsWith(".rb")) return "ruby"
  if (l.endsWith(".go")) return "go"
  if (l.endsWith(".html") || l.endsWith(".htm") || l.endsWith(".css")) return "static"
  return "unknown"
}

function isReloadable(relPath: string, isServed: boolean) {
  if (!isServed) return "no"
  return reloadablePatterns.some((re) => re.test(relPath)) ? "likely" : "unknown"
}

function guessVerificationMethod(targetPath: string, served: boolean) {
  const l = targetPath.toLowerCase()

  if (served && /\.(html|htm|css|js|png|jpg|jpeg|gif|svg|txt|json|xml)$/i.test(l)) {
    return "served-url"
  }

  if (/\.(py|jsp|php|rb|js)$/i.test(l) || /__init__\.py$/i.test(l)) {
    return "import/reload side effect"
  }

  if (/log/i.test(l)) {
    return "log/debug view"
  }

  if (/template|view|layout|partial/i.test(l)) {
    return "rendered page"
  }

  return "unknown; do not assume HTTP accessibility"
}

export default tool({
  description: "CTF file-write matrix: given candidate target paths and a write-capable endpoint, produce a decision matrix with existence, writability, create/overwrite flags, reload/serve behavior, risk estimates, and canary result columns. Helps avoid blind destructive overwrites.",
  args: {
    paths: tool.schema.string().describe("Newline- or comma-separated list of candidate target paths on the server"),
    endpoint: tool.schema.string().describe("The HTTP endpoint or primitive that can write files (used for suggested canary probes)"),
    served: tool.schema.boolean().default(true).describe("Assume these paths are served via HTTP if true"),
  },
  async execute(args) {
    const raw = args.paths
    const endpoint = args.endpoint || "UNKNOWN_WRITE_ENDPOINT"
    const served = args.served !== false

    const paths = raw
      .split(/[\r\n,]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)

    const rows: string[][] = []
    rows.push(["Path", "Runtime", "Reloaded/Served", "Create New", "Overwrite Existing", "Risk", "Verification Method", "Canary Plan"])

    for (const p of paths) {
      const runtime = guessRuntime(p)
      const reload = isReloadable(p, served)
      const risk = riskCategories[runtime] ?? "unknown reload behavior"
      const verification = guessVerificationMethod(p, served)
      const marker = `CANARY_MARKER_<timestamp>_<random>`

      const canary = [
        `Plan only: verify endpoint semantics first.`,
        `Use marker ${marker}.`,
        `Do not overwrite until original content/hash is saved when possible.`,
        `Verify via ${verification}.`,
        `If verification is unknown, do not proceed without a High-Risk Action Plan.`,
      ].join(" ")

      rows.push([
        p,
        runtime,
        reload,
        "?",
        "?",
        risk,
        verification,
        canary,
      ])
    }

    if (rows.length === 1) return "file-write-matrix: no paths provided"

    return rows.map((r) => r.join(" | ")).join("\n")
  },
})
