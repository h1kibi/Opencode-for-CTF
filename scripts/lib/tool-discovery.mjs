import { readdir } from "node:fs/promises"
import path from "node:path"

const DEFAULT_EXTENSIONS = [".ts", ".js"]

function stripExtension(fileName, extensions) {
  for (const extension of extensions) {
    if (fileName.endsWith(extension) && !fileName.endsWith(`.d${extension}`)) {
      return fileName.slice(0, -extension.length)
    }
  }
  return null
}

async function walk(directory, baseDirectory, extensions, collected) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === "lib") continue
      await walk(path.join(directory, entry.name), baseDirectory, extensions, collected)
      continue
    }
    if (!entry.isFile()) continue
    const name = stripExtension(entry.name, extensions)
    if (!name) continue
    const filePath = path.join(directory, entry.name)
    collected.push({ name, path: filePath, relative: path.relative(baseDirectory, filePath) })
  }
}

/**
 * Discover tool entry files under `rootDirectory`.
 *
 * The plugin runtime and the bundler must agree on what counts as one tool:
 * `lib/` holds shared helpers, declaration files are not entries, and two files
 * with the same basename would register as one tool name. Both callers use this
 * function so a rule change cannot drift between them.
 */
export async function discoverToolEntries(rootDirectory, options = {}) {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const collected = []
  await walk(rootDirectory, rootDirectory, extensions, collected)
  collected.sort((left, right) => left.name.localeCompare(right.name) || left.relative.localeCompare(right.relative))

  const byName = new Map()
  for (const entry of collected) {
    const existing = byName.get(entry.name)
    if (existing) {
      throw new Error(`duplicate CTF tool basename "${entry.name}": ${existing} and ${entry.relative}`)
    }
    byName.set(entry.name, entry.relative)
  }
  return collected
}
