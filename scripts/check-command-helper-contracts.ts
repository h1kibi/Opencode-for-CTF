// Manual QA utility — not part of CI or npm run check. Run with: npx tsx scripts/check-command-helper-contracts.ts
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

type Rule = {
  file: string
  checks: Array<{ name: string; pattern: RegExp }>
}

const currentCommandRules: Rule[] = [
  {
    file: resolve("commands", "ctf.md"),
    checks: [
      { name: "ctf binding route", pattern: /BINDING route/i },
      { name: "ctf route planner", pattern: /ctf-route-plan/i },
      { name: "ctf independent lanes", pattern: /lane does not switch automatically/i },
      { name: "ctf public help", pattern: /Help: `\/help`/i },
    ],
  },
  {
    file: resolve("commands", "help.md"),
    checks: [
      { name: "help documents main entry", pattern: /`\/ctf <target>`/i },
      { name: "help documents public help entry", pattern: /`\/help`/i },
      { name: "help says historical commands are gone", pattern: /Historical compatibility aliases/i },
      { name: "help points advanced flows at tools and skills", pattern: /tools, and skills/i },
    ],
  },
  {
    file: resolve("commands", "resume.md"),
    checks: [
      { name: "resume preferred evidence order", pattern: /Preferred evidence order under `work\/ctf-evidence\//i },
      {
        name: "resume default disk target",
        pattern: /Default disk target: `work\/ctf-evidence\/<challenge-slug>\/resume\.md`/i,
      },
      { name: "resume packet preference", pattern: /Prefer `templates\/ctf_resume_packet\.md`-style content first/i },
      {
        name: "resume structured evidence",
        pattern: /route\.json, `hypotheses\.json`, `signal-memory\.yaml`, and `primitive\.json`/i,
      },
      {
        name: "resume evidence doctor hint",
        pattern:
          /Prefer `ctf:evidence-doctor <challenge-slug>` or `node scripts\/ctf-evidence-doctor\.ts <challenge-slug>`/i,
      },
    ],
  },
  {
    file: resolve("commands", "ctf-fast.md"),
    checks: [
      { name: "fast uses fast agent", pattern: /agent: ctf-fast/i },
      { name: "fast soft budget", pattern: /15 minutes/i },
      { name: "fast allowlist", pattern: /fast tool allowlist/i },
      { name: "fast evidence board bootstrap", pattern: /ctf-evidence-board command=init/i },
    ],
  },
  {
    file: resolve("commands", "ctf-pwn.md"),
    checks: [
      { name: "pwn shared boundary reference", pattern: /references\/pwn-mode-boundary\.md/i },
      { name: "pwn shared runtime trigger reference", pattern: /references\/pwn-runtime-trigger-matrix\.md/i },
    ],
  },
  {
    file: resolve("commands", "ctf-expert.md"),
    checks: [
      { name: "expert entry exists", pattern: /ctf-expert/i },
      { name: "expert evidence board", pattern: /ctf-evidence-board/i },
      { name: "expert team dispatch", pattern: /ctf-team-dispatch/i },
      { name: "expert mcp control", pattern: /ctf-mcp-control/i },
    ],
  },
  {
    file: resolve("tools", "core", "ctf-evidence-board.ts"),
    checks: [
      { name: "evidence board owns evidence markdown", pattern: /Evidence\.md/i },
      { name: "evidence board owns closure state", pattern: /closure/i },
      { name: "evidence board writes canonical state", pattern: /case\.json/i },
    ],
  },
  {
    file: resolve("src", "team", "team-runtime-core.ts"),
    checks: [
      { name: "team mode exposes dispatch", pattern: /ctf-team-dispatch/i },
      { name: "team mode exposes collect", pattern: /ctf-team-collect/i },
    ],
  },
]

const retiredCommands = [
  "ctf-snapshot.md",
  "ctf-closure.md",
  "ctf-final.md",
  "ctf-close.md",
  "ctf-hard-open.md",
  "ctf-fanout.md",
  "ctf-control.md",
  "ctf-signal-memory.md",
  "ctf-evidence.md",
]

function main() {
  const failures: string[] = []
  console.log("# Command Helper Contract Audit\n")
  console.log("| File | Check | Status |")
  console.log("|---|---|---|")

  for (const rule of currentCommandRules) {
    if (!existsSync(rule.file)) {
      failures.push(`${rule.file}: missing file`)
      console.log(`| ${rule.file.replace(process.cwd() + "\\", "")} | file exists | FAIL |`)
      continue
    }
    const text = readFileSync(rule.file, "utf8")
    for (const check of rule.checks) {
      const ok = check.pattern.test(text)
      console.log(`| ${rule.file.replace(process.cwd() + "\\", "")} | ${check.name} | ${ok ? "PASS" : "FAIL"} |`)
      if (!ok) failures.push(`${rule.file}: ${check.name}`)
    }
  }

  for (const command of retiredCommands) {
    const file = resolve("commands", command)
    const ok = !existsSync(file)
    console.log(`| commands\\${command} | retired command absent | ${ok ? "PASS" : "FAIL"} |`)
    if (!ok) failures.push(`${file}: retired command should not be installed`)
  }

  console.log("\n## Summary\n")
  console.log(
    `- Checked rules: ${currentCommandRules.reduce((n, r) => n + r.checks.length, 0) + retiredCommands.length}`,
  )
  console.log(`- Failures: ${failures.length}`)
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }
}

main()
