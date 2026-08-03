/**
 * Fetch external CTF skills repository on demand.
 *
 * Instead of vendoring the external SecKnowledge reference skill into git,
 * this script clones (or updates) the skills into skills-external/
 * as a shallow checkout under skills-external/secknowledge-skill.
 *
 * Usage: node scripts/fetch-skills.mjs
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const TARGET = resolve(ROOT, "skills-external", "secknowledge-skill")
const REPO = "https://github.com/Pa55w0rd/secknowledge-skill.git"

// Pin a specific commit for reproducible builds.
// Set to empty string "" to track origin/main (unpinned).
// Update this when you explicitly want a newer version of the skills.
const PINNED_COMMIT = "078de3baa6b325f5acc5338c62169532e8f922b4"

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
  if (!existsSync(join(TARGET, ".git"))) {
    throw new Error(`[fetch-skills] ${TARGET} exists but is not a git checkout; move it aside before fetching` )
  }
  console.log(`[fetch-skills] Updating existing checkout at ${TARGET}`)
  const remote = execSync("git remote get-url origin", { cwd: TARGET, encoding: "utf8" }).trim()
  if (remote !== REPO) {
    throw new Error(`[fetch-skills] remote mismatch: expected ${REPO}, got ${remote}`)
  }
  const dirty = execSync("git status --porcelain", { cwd: TARGET, encoding: "utf8" }).trim()
  if (dirty) {
    throw new Error("[fetch-skills] refusing to overwrite a dirty external checkout; commit/stash it first")
  }
  run(`git fetch --depth=1 origin ${resolveRef()}`, TARGET)
  run(`git checkout --detach ${resolveRef()}`, TARGET)
} else {
  console.log(`[fetch-skills] Cloning ${REPO} into ${TARGET}`)
  run(`git clone --depth=1 --single-branch ${REPO} "${TARGET}"`, ROOT)
  // If pinned, fetch the specific commit after clone
  if (PINNED_COMMIT) {
    run(`git fetch --depth=1 origin ${PINNED_COMMIT}`, TARGET)
    run(`git checkout --detach ${PINNED_COMMIT}`, TARGET)
  }
}

console.log("[fetch-skills] Done.")
console.log(`[fetch-skills] Skills available at ${TARGET}`)
