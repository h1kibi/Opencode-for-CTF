import { tool } from "@opencode-ai/plugin"
import { runEnvChecks, summarizeEnvChecks, type EnvCheckItem } from "./lib/env-check-core.ts"

type Check = EnvCheckItem

function checksFor(profile: string): Check[] {
  const basic: Check[] = [
    {
      name: "rg",
      command: "rg",
      args: ["--version"],
      required: true,
      category: "inventory",
      purpose: "fast keyword/path/source search",
      fallback: "use grep/glob/read or language-specific scripts",
      hint: "Install ripgrep and ensure rg is on PATH.",
    },
    {
      name: "fd",
      command: "fd",
      args: ["--version"],
      required: false,
      category: "inventory",
      purpose: "fast file discovery",
      fallback: "use find/glob",
      hint: "Install fd/fd-find and ensure fd is on PATH.",
    },
    {
      name: "jq",
      command: "jq",
      args: ["--version"],
      required: true,
      category: "config",
      purpose: "JSON manifest/API parsing",
      fallback: "use python -m json.tool or short Python json scripts",
      hint: "Install jq and ensure jq is on PATH.",
    },
    {
      name: "yq",
      command: "yq",
      args: ["--version"],
      required: false,
      category: "config",
      purpose: "YAML manifest parsing",
      fallback: "use Python yaml if available or direct read/grep",
      hint: "Install yq and ensure yq is on PATH.",
    },
    {
      name: "semgrep",
      command: "semgrep",
      args: ["--version"],
      required: true,
      category: "sast",
      purpose: "focused CTF sink/source rules",
      fallback: "use rg + ast-grep + ctf-web-source-map manual slices",
      hint: "Install Semgrep, e.g. python -m pip install semgrep, or use a packaged binary.",
    },
    {
      name: "codeql",
      command: "codeql",
      args: ["--version"],
      required: false,
      category: "dataflow",
      purpose: "cross-function dataflow and custom queries",
      fallback: "use Semgrep plus manual source-to-sink slicing",
      hint: "Install GitHub CodeQL CLI and add it to PATH.",
    },
    {
      name: "gitleaks",
      command: "gitleaks",
      args: ["version"],
      required: true,
      category: "secrets",
      purpose: "redacted secret discovery",
      fallback: "use rg for key/token/password patterns; never print full secrets",
      hint: "Install gitleaks and use --redact by default.",
    },
    {
      name: "trivy",
      command: "trivy",
      args: ["--version"],
      required: true,
      category: "dependency",
      purpose: "filesystem dependency/container/IaC scanning",
      fallback: "parse manifests and use osv-scanner or manual version gates",
      hint: "Install Trivy and ensure trivy is on PATH.",
    },
    {
      name: "osv-scanner",
      command: "osv-scanner",
      args: ["--version"],
      required: false,
      category: "dependency",
      purpose: "lockfile dependency vulnerability checks",
      fallback: "use trivy fs or manual dependency version checks",
      hint: "Install osv-scanner and ensure it is on PATH.",
    },
    {
      name: "jar",
      command: "jar",
      args: ["--version"],
      required: false,
      category: "java",
      purpose: "JAR/WAR listing and extraction",
      fallback: "use ctf-java-archive-map or unzip -l",
      hint: "Install a JDK and ensure jar is on PATH.",
    },
    {
      name: "javap",
      command: "javap",
      args: ["--version"],
      required: false,
      category: "java",
      purpose: "bytecode constants and annotations",
      fallback: "use ctf-java-bytecode-hints or decompiler",
      hint: "Install a JDK and ensure javap is on PATH.",
    },
    {
      name: "jadx",
      command: "jadx",
      args: ["--version"],
      required: false,
      category: "java",
      purpose: "APK/Java bytecode decompilation",
      fallback: "use CFR/fernflower/javap or ctf-java-decompile-targets",
      hint: "Install jadx and ensure jadx is on PATH.",
    },
  ]
  const full: Check[] = [
    {
      name: "bandit",
      command: "bandit",
      args: ["--version"],
      required: false,
      category: "python",
      purpose: "Python security lint",
      fallback: "Semgrep Python rules + rg dangerous APIs",
      hint: "python -m pip install bandit",
    },
    {
      name: "pip-audit",
      command: "pip-audit",
      args: ["--version"],
      required: false,
      category: "python",
      purpose: "Python dependency audit",
      fallback: "trivy fs / osv-scanner / requirements manual review",
      hint: "python -m pip install pip-audit",
    },
    {
      name: "gosec",
      command: "gosec",
      args: ["-version"],
      required: false,
      category: "go",
      purpose: "Go security lint",
      fallback: "Semgrep Go rules + rg dangerous APIs",
      hint: "go install github.com/securego/gosec/v2/cmd/gosec@latest",
    },
    {
      name: "govulncheck",
      command: "govulncheck",
      args: ["-version"],
      required: false,
      category: "go",
      purpose: "Go vulnerability check",
      fallback: "trivy fs / osv-scanner / go.mod manual review",
      hint: "go install golang.org/x/vuln/cmd/govulncheck@latest",
    },
    {
      name: "retire",
      command: "retire",
      args: ["--version"],
      required: false,
      category: "node",
      purpose: "JS library vulnerability hints",
      fallback: "npm audit/pnpm audit + trivy fs",
      hint: "npm install -g retire",
    },
    {
      name: "brakeman",
      command: "brakeman",
      args: ["--version"],
      required: false,
      category: "ruby",
      purpose: "Rails white-box scanner",
      fallback: "Semgrep Ruby/Rails rules",
      hint: "gem install brakeman",
    },
  ]
  return profile === "full" ? [...basic, ...full] : basic
}

export default tool({
  description:
    "CTF white-box audit environment check: verify rg/fd/jq/yq/Semgrep/CodeQL/gitleaks/Trivy/OSV/Java tools and emit fallbacks for missing tooling.",
  args: {
    profile: tool.schema
      .string()
      .optional()
      .describe(
        "basic | full. basic checks core white-box tools, full adds language-specific scanners. Default basic.",
      ),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args) {
    const profile = (args.profile || "basic").toLowerCase() === "full" ? "full" : "basic"
    const selected = checksFor(profile)
    const results = await runEnvChecks(selected, 6000)
    const baseSummary = summarizeEnvChecks(results)
    const presentByCategory = [...new Set(results.filter((x) => x.ok).map((x) => x.category))].sort()
    const summary = {
      profile,
      ready: baseSummary.ready,
      required_ok: baseSummary.required_ok,
      required_total: baseSummary.required_total,
      present_categories: presentByCategory,
      required_missing: baseSummary.required_missing,
      optional_missing: baseSummary.optional_missing,
      results,
    }
    if (args.jsonOnly) return JSON.stringify(summary, null, 2)
    return [
      "# CTF White-box Audit Environment",
      `profile: ${profile}`,
      `ready: ${summary.ready}`,
      `required_ok: ${summary.required_ok}/${summary.required_total}`,
      `present_categories: ${summary.present_categories.length ? summary.present_categories.join(" | ") : "none"}`,
      `required_missing: ${summary.required_missing.length ? summary.required_missing.join(" | ") : "none"}`,
      `optional_missing: ${summary.optional_missing.length ? summary.optional_missing.join(" | ") : "none"}`,
      "",
      "## Checks",
      ...results.map(
        (r) =>
          `- ${r.ok ? "OK" : r.required ? "MISSING_REQUIRED" : "missing_optional"} ${r.name} [${r.category}]: ${r.version} | purpose: ${r.purpose}${r.ok ? "" : ` | fallback: ${r.fallback} | hint: ${r.hint}`}`,
      ),
      "",
      "## Recommended Agent Behavior",
      summary.ready
        ? "- Core white-box CLI environment is ready. Start with ctf-one-shot-triage/source map, then focused Semgrep and dependency/secret checks."
        : "- Core white-box CLI environment is incomplete. Use built-in CTF mapping tools and listed fallbacks before attempting missing external CLIs.",
      "- Keep secret output redacted; record only file, line, type, and exploit relevance.",
      "- Do not dump full scanner reports; convert findings into top-3 hypotheses and one-variable probe contracts.",
    ].join("\n")
  },
})
