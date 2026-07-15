import { readFileSync } from "fs"
import { resolve } from "path"

type Rule = {
  file: string
  checks: Array<{ name: string; pattern: RegExp }>
}

const rules: Rule[] = [
  {
    file: resolve("commands", "ctf-resume.md"),
    checks: [
      { name: "resume preferred evidence order", pattern: /Preferred evidence order under `work\/ctf-evidence\//i },
      { name: "resume default disk target", pattern: /Default disk target: `work\/ctf-evidence\/<challenge-slug>\/resume\.md`/i },
      { name: "resume packet preference", pattern: /Prefer `templates\/ctf_resume_packet\.md`-style content first/i },
      { name: "resume structured evidence", pattern: /route\.json, `hypotheses\.json`, `signal-memory\.yaml`, and `primitive\.json`/i },
      { name: "resume evidence doctor hint", pattern: /Prefer `ctf:evidence-doctor <challenge-slug>` or `node scripts\/ctf-evidence-doctor\.ts <challenge-slug>`/i },
    ],
  },
  {
    file: resolve("commands", "ctf-snapshot.md"),
    checks: [
      { name: "snapshot default disk target", pattern: /Default disk target: `work\/ctf-evidence\/<challenge-slug>\/snapshot\.md`/i },
      { name: "snapshot writer-first hint", pattern: /prefer updating `route\.json`, `hypotheses\.json`, and `primitive\.json`/i },
    ],
  },
  {
    file: resolve("commands", "ctf-closure.md"),
    checks: [
      { name: "closure default disk target", pattern: /Default disk targets: `work\/ctf-evidence\/<challenge-slug>\/closure\.json`/i },
      { name: "closure writer hint", pattern: /Prefer `write-evidence-state closure <challenge-slug> .*` or the dedicated closure writer/i },
    ],
  },
  {
    file: resolve("commands", "ctf-final.md"),
    checks: [
      { name: "final default disk target", pattern: /Default disk target: `work\/ctf-evidence\/<challenge-slug>\/final-verification\.txt`/i },
      { name: "final preserves branch history", pattern: /Preserve existing `resume\.md`, `handoff\.md`, `fast-handoff\.md`, and `snapshot\.md`/i },
      { name: "final verifier contract", pattern: /Prefer `ctf-verifier` or the equivalent verifier contract/i },
    ],
  },
  {
    file: resolve("commands", "ctf-hard-open.md"),
    checks: [
      { name: "hard-open evidence packet", pattern: /Prefer initializing `work\/ctf-evidence\/<challenge-slug>\/` early/i },
      { name: "hard-open hypotheses file", pattern: /refresh `route\.json`, `inventory\.md`, and `hypotheses\.json`/i },
      { name: "hard-open evidence doctor refresh", pattern: /refresh the evidence packet with `ctf:evidence-doctor <challenge-slug>`/i },
    ],
  },
  {
    file: resolve("commands", "ctf.md"),
    checks: [
      { name: "ctf route profile recommendation", pattern: /Recommended route profiles:/i },
      { name: "ctf resume bias", pattern: /If there is already a populated `work\/ctf-evidence\/<challenge-slug>\/` branch/i },
      { name: "ctf evidence doctor recommendation", pattern: /Prefer `ctf:evidence-doctor <challenge-slug>` once a stable slug exists/i },
    ],
  },
  {
    file: resolve("commands", "ctf-fanout.md"),
    checks: [
      { name: "fanout evidence doctor merge hint", pattern: /refresh the packet with `ctf:evidence-doctor <challenge-slug>`/i },
    ],
  },
  {
    file: resolve("commands", "ctf-fast.md"),
    checks: [
      { name: "pwn-fast shared boundary reference", pattern: /references\/pwn-mode-boundary\.md/i },
      { name: "pwn-fast shared runtime trigger reference", pattern: /references\/pwn-runtime-trigger-matrix\.md/i },
    ],
  },
  {
    file: resolve("commands", "ctf-pwn.md"),
    checks: [
      { name: "pwn command shared boundary reference", pattern: /references\/pwn-mode-boundary\.md/i },
      { name: "pwn command shared runtime trigger reference", pattern: /references\/pwn-runtime-trigger-matrix\.md/i },
    ],
  },
  {
    file: resolve("commands", "ctf-master.md"),
    checks: [
      { name: "rigorous shared boundary reference", pattern: /references\/pwn-mode-boundary\.md/i },
      { name: "rigorous shared runtime trigger reference", pattern: /references\/pwn-runtime-trigger-matrix\.md/i },
    ],
  },
]

function main() {
  const failures: string[] = []
  console.log("# Command Helper Contract Audit\n")
  console.log("| File | Check | Status |")
  console.log("|---|---|---|")

  for (const rule of rules) {
    const text = readFileSync(rule.file, "utf8")
    for (const check of rule.checks) {
      const ok = check.pattern.test(text)
      console.log(`| ${rule.file.replace(process.cwd() + "\\", "")} | ${check.name} | ${ok ? "PASS" : "FAIL"} |`)
      if (!ok) failures.push(`${rule.file}: ${check.name}`)
    }
  }

  console.log("\n## Summary\n")
  console.log(`- Checked rules: ${rules.reduce((n, r) => n + r.checks.length, 0)}`)
  console.log(`- Failures: ${failures.length}`)
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }
}

main()
