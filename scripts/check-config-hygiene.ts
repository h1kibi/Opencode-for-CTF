import { readFileSync } from "fs"
import { resolve } from "path"

type Finding = {
  severity: "FAIL" | "WARN"
  message: string
}

function countMatches(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length
}

function main() {
  const configPath = resolve("opencode.jsonc")
  const text = readFileSync(configPath, "utf8")
  const findings: Finding[] = []

  const aipieBlockMatch = text.match(/"aipie"\s*:\s*\{[\s\S]*?"models"\s*:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}/)
  if (aipieBlockMatch) {
    const aipieModels = aipieBlockMatch[1]
    const gpt54Count = countMatches(aipieModels, /"gpt-5\.4"\s*:/g)
    if (gpt54Count > 1) {
      findings.push({
        severity: "FAIL",
        message: `provider.aipie.models contains duplicate gpt-5.4 keys (${gpt54Count})`,
      })
    }
  }

  if (!/"default_agent"\s*:\s*"daily"/.test(text)) {
    findings.push({
      severity: "WARN",
      message: "default_agent is not explicitly set to daily",
    })
  }

  if (!/"plugin"\s*:\s*\[[\s\S]*?"oh-my-openagent@latest"/.test(text)) {
    findings.push({
      severity: "WARN",
      message: "oh-my-openagent plugin entry not found in plugin array",
    })
  }

  if (!/"instructions"\s*:\s*\[[\s\S]*?"\.\/rules\/zh-rules\.md"/.test(text)) {
    findings.push({
      severity: "WARN",
      message: "rules/zh-rules.md is not present in instructions[]",
    })
  }

  console.log("# Config Hygiene Audit\n")
  console.log(`- file: ${configPath}`)
  console.log("\n| Severity | Finding |")
  console.log("|---|---|")

  if (findings.length === 0) {
    console.log("| PASS | no hygiene findings |")
    return
  }

  for (const finding of findings) {
    console.log(`| ${finding.severity} | ${finding.message.replace(/\|/g, "/")} |`)
  }

  const failCount = findings.filter((finding) => finding.severity === "FAIL").length
  process.exit(failCount > 0 ? 1 : 0)
}

main()
