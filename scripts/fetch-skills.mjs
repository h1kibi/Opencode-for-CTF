/**
 * Fetch external CTF skills repository on demand.
 *
 * Instead of vendoring ~12,000 files from ctf-skills into git,
 * this script clones (or updates) the skills into skills-external/
 * as a shallow, sparse checkout.
 *
 * Usage: node scripts/fetch-skills.mjs
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const TARGET = resolve(ROOT, "skills-external", "ctf-skills")
const REPO = "https://github.com/ljagiello/ctf-skills.git"

// Pin a specific commit for reproducible builds.
// Set to empty string "" to track origin/main (unpinned).
// Update this when you explicitly want a newer version of the skills.
const PINNED_COMMIT = ""

function run(cmd, cwd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd, stdio: "inherit" })
}

function resolveRef() {
  if (PINNED_COMMIT) {
    return PINNED_COMMIT
  }
  // Fallback: track main.  Not reproducible — the version will differ
  // depending on when npm install was last run.
  console.warn("[fetch-skills] WARNING: No PINNED_COMMIT set; tracking origin/main (unpinned)")
  return "origin/main"
}

if (existsSync(TARGET)) {
  console.log(`[fetch-skills] Updating existing checkout at ${TARGET}`)
  run("git fetch --depth=1", TARGET)
  run(`git reset --hard ${resolveRef()}`, TARGET)
} else {
  console.log(`[fetch-skills] Cloning ${REPO} into ${TARGET}`)
  run(`git clone --depth=1 --single-branch ${REPO} "${TARGET}"`, ROOT)
  // If pinned, fetch the specific commit after clone
  if (PINNED_COMMIT) {
    run(`git fetch --depth=1 origin ${PINNED_COMMIT}`, TARGET)
    run(`git reset --hard ${PINNED_COMMIT}`, TARGET)
  }
}

console.log("[fetch-skills] Done.")
console.log(`[fetch-skills] Skills available at ${TARGET}`)
