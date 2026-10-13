#!/usr/bin/env node
import { runToolChecks, TOOL_CHECK_GROUPS } from "./lib/tool-checks.mjs"
import { wireMcpBackendStatus } from "./lib/wiremcp-status.mjs"

// Toolchain doctor: checks the smallest useful toolchain per challenge family.
// Install health is covered by `opencode-for-ctf doctor` (doctor-install.mjs).

const grouped = runToolChecks()
const wireMcp = wireMcpBackendStatus()

console.log("# CTF Doctor")
console.log("\nThis script checks the smallest useful toolchain for each challenge family.")

for (const group of TOOL_CHECK_GROUPS) {
  const bucket = grouped.get(group) ?? { found: [], missing: [] }
  console.log(`\n## ${group}`)
  console.log(`found: ${bucket.found.length ? bucket.found.join(", ") : "none"}`)
  console.log(`missing: ${bucket.missing.length ? bucket.missing.join(", ") : "none"}`)
}

console.log("\nUse missing tools only when the selected challenge path requires them.")
console.log(`WireMCP backend: ${wireMcp.label}`)
