import { createReadStream, createWriteStream, existsSync, readdirSync } from "node:fs"
import { mkdir, mkdtemp, open, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const REPO_URL = "https://github.com/NYU-LLM-CTF/NYU_CTF_Bench.git"
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_DIR = resolve(REPO_ROOT, ".cache", "nyu-ctf-bench")

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasHelp() {
  return process.argv.includes("--help") || process.argv.includes("-h")
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`)
}

function runGit(args, cwd) {
  runCommand("git", args, cwd)
}

function runGitWithRetry(args, cwd, label, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) console.log(`${label}: retry ${attempt}/${attempts}`)
      runGit(args, cwd)
      return
    } catch (error) {
      lastError = error
      if (attempt < attempts) continue
    }
  }
  throw lastError
}

function captureGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${result.status ?? 1}: ${result.stderr ?? ""}`)
  }
  return result.stdout ?? ""
}

function usage() {
  console.log(`NYU CTF Bench dataset setup

Usage:
  npm run benchmark:nyu:setup -- [--dir <directory>] [--ref <branch-or-tag>] [--split <development|test|both>]

Defaults:
  --dir    ${DEFAULT_DIR}
  --ref    main
  --split  both

The setup uses a blob-filtered, no-checkout clone, then creates one Git archive
per selected split containing only the challenge subtrees referenced by the
official dataset JSON files. A small tar reader extracts those archives without
letting Windows-invalid names reach the filesystem. On Windows, invalid path
characters are replaced and local dataset JSON files are rewritten to point at
those safe paths.`)
}

function hashSuffix(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8)
}

function safeSegment(value, used) {
  if (process.platform !== "win32") return value
  let safe = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[ .]+$/g, "")
  if (!safe) safe = "_"
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safe)) safe = `_${safe}`
  const existing = used.get(safe)
  if (existing && existing !== value) safe = `${safe}~${hashSuffix(value)}`
  used.set(safe, value)
  return safe
}

function safeRelativePath(value, pathMap) {
  const normalized = value.replaceAll("\\", "/")
  if (isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) throw new Error(`invalid path: ${value}`)
  const parts = normalized.split("/").filter(Boolean)
  if (!parts.length || parts.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`invalid path: ${value}`)
  }
  return parts.map((segment) => safeSegment(segment, pathMap)).join("/")
}

function datasetEntries(raw) {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== "object") throw new Error("NYU dataset JSON must contain an object or array")
  return Object.values(raw)
}

function rewriteDataset(raw, pathMap) {
  if (Array.isArray(raw)) return raw.map((entry) => rewriteEntry(entry, pathMap))
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, rewriteEntry(entry, pathMap)]))
}

function rewriteEntry(entry, pathMap) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("NYU dataset entry must be an object")
  }
  const record = { ...entry }
  if (typeof record.path !== "string" || !record.path.trim()) throw new Error("NYU dataset entry is missing path")
  record.path = safeRelativePath(record.path, pathMap)
  return record
}

function selectedDatasetFiles(split) {
  if (split === "development") return ["development_dataset.json"]
  if (split === "test") return ["test_dataset.json"]
  return ["development_dataset.json", "test_dataset.json"]
}

function tarField(header, start, length) {
  const end = header.indexOf(0, start)
  return header.subarray(start, end >= 0 && end < start + length ? end : start + length).toString("utf8")
}

function tarSize(header) {
  const text = tarField(header, 124, 12).trim().replace(/\0/g, "")
  if (!text) return 0
  const value = Number.parseInt(text.replace(/^0+/, "") || "0", 8)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid tar entry size: ${text}`)
  return value
}

function isZeroBlock(block) {
  for (const byte of block) if (byte !== 0) return false
  return true
}

function parsePaxPath(data) {
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space < 0) break
    const length = Number.parseInt(data.subarray(offset, space).toString("ascii"), 10)
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) break
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8")
    if (record.startsWith("path=")) return record.slice(5)
    offset += length
  }
  return undefined
}

async function readRange(handle, offset, size) {
  const result = Buffer.alloc(size)
  let read = 0
  while (read < size) {
    const chunk = await handle.read(result, read, size - read, offset + read)
    if (!chunk.bytesRead) throw new Error("unexpected end of tar archive")
    read += chunk.bytesRead
  }
  return result
}

function archiveEntryTarget(root, archiveName, pathMap) {
  const safePath = safeRelativePath(archiveName.replace(/\/$/, ""), pathMap)
  const target = resolve(root, safePath)
  const rootPath = resolve(root)
  const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`
  if (target !== rootPath && !target.startsWith(prefix))
    throw new Error(`tar entry escapes output directory: ${archiveName}`)
  return { safePath, target }
}

async function extractTar(archive, outputRoot, pathMap) {
  const handle = await open(archive, "r")
  const deferredLinks = []
  let skippedLinks = 0
  let offset = 0
  let longName
  let paxPath
  try {
    while (true) {
      const header = await readRange(handle, offset, 512)
      offset += 512
      if (isZeroBlock(header)) break

      const type = String.fromCharCode(header[156] || 0)
      const size = tarSize(header)
      const dataOffset = offset
      const paddedSize = Math.ceil(size / 512) * 512
      let name = tarField(header, 0, 100)
      const prefix = tarField(header, 345, 155)
      if (prefix) name = `${prefix}/${name}`
      if (longName) {
        name = longName
        longName = undefined
      }
      if (paxPath) {
        name = paxPath
        paxPath = undefined
      }

      if (type === "L") {
        longName = (await readRange(handle, dataOffset, size)).toString("utf8").replace(/\0+$/, "")
      } else if (type === "x" || type === "g") {
        paxPath = parsePaxPath(await readRange(handle, dataOffset, size))
      } else if (type === "5") {
        const { target } = archiveEntryTarget(outputRoot, name, pathMap)
        await mkdir(target, { recursive: true })
      } else if (type === "0" || type === "7" || type === "\0") {
        const { target } = archiveEntryTarget(outputRoot, name, pathMap)
        await mkdir(dirname(target), { recursive: true })
        if (size === 0) {
          await writeFile(target, Buffer.alloc(0))
        } else {
          await pipeline(
            createReadStream(archive, { start: dataOffset, end: dataOffset + size - 1 }),
            createWriteStream(target),
          )
        }
      } else if (type === "2" || type === "1") {
        const linkName = tarField(header, 157, 100)
        deferredLinks.push({ type, name, linkName })
      }
      offset += paddedSize
    }
  } finally {
    await handle.close()
  }

  for (const link of deferredLinks) {
    const { target } = archiveEntryTarget(outputRoot, link.name, pathMap)
    const linkTarget = link.linkName.replaceAll("\\", "/")
    const rootPath = resolve(outputRoot)
    const prefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`
    if (isAbsolute(linkTarget) || /^[A-Za-z]:\//.test(linkTarget)) {
      skippedLinks += 1
      continue
    }
    const resolvedLink = resolve(dirname(target), linkTarget)
    if (resolvedLink !== rootPath && !resolvedLink.startsWith(prefix)) {
      // Some historical challenges contain links to host Python headers or
      // libraries. They are not portable challenge inputs and must not escape
      // the materialized dataset root.
      skippedLinks += 1
      continue
    }
    await mkdir(dirname(target), { recursive: true })
    const relativeTarget = relative(dirname(target), resolvedLink) || "."
    try {
      await symlink(relativeTarget, target, link.type === "1" ? "file" : "junction")
    } catch (error) {
      if (link.type !== "2") throw error
      // Windows may not permit symlink creation. Copy an available target so
      // the challenge remains usable; otherwise preserve the link text.
      try {
        const { cp } = await import("node:fs/promises")
        await cp(resolvedLink, target, { recursive: true, dereference: true })
      } catch {
        await writeFile(target, linkTarget, "utf8")
      }
    }
  }
  return skippedLinks
}

async function main() {
  const requestedDir = option("--dir")
  const target = resolve(requestedDir ?? DEFAULT_DIR)
  const ref = option("--ref") ?? "main"
  const split = option("--split") ?? "both"
  if (hasHelp()) {
    usage()
    return
  }
  if (!ref.trim()) throw new Error("--ref must not be empty")
  if (!["development", "test", "both"].includes(split)) {
    throw new Error("--split must be development, test, or both")
  }

  if (existsSync(target)) {
    let entries = []
    try {
      entries = readdirSync(target)
    } catch (error) {
      throw new Error(
        `cannot inspect target directory ${target}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (entries.length > 0) {
      throw new Error(`target directory is not empty: ${target}; remove it manually or choose another --dir`)
    }
  }

  await mkdir(dirname(target), { recursive: true })
  const staging = await mkdtemp(`${target}.partial-`)
  try {
    console.log(`Cloning ${REPO_URL} at ${ref} into ${staging}`)
    runGitWithRetry(
      ["clone", "--filter=blob:none", "--no-checkout", "--depth", "1", "--branch", ref, REPO_URL, staging],
      REPO_ROOT,
      "clone",
    )

    const pathMap = new Map()
    const datasets = []
    const challengePathsBySplit = new Map()
    for (const datasetFile of selectedDatasetFiles(split)) {
      const rawText = captureGit(["show", `HEAD:${datasetFile}`], staging).replace(/^\uFEFF/, "")
      const raw = JSON.parse(rawText)
      const rewritten = rewriteDataset(raw, pathMap)
      const challengePaths = new Map()
      for (const entry of datasetEntries(raw)) {
        if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
          throw new Error(`${datasetFile} contains an invalid challenge path`)
        }
        const originalPath = entry.path.replaceAll("\\", "/")
        challengePaths.set(originalPath, safeRelativePath(originalPath, pathMap))
      }
      datasets.push({ datasetFile, rewritten })
      challengePathsBySplit.set(datasetFile.replace("_dataset.json", ""), challengePaths)
    }

    for (const [splitName, challengePaths] of challengePathsBySplit) {
      const archive = resolve(staging, `.nyu-ctf-bench-${splitName}.tar`)
      const pathspecs = [...challengePaths.keys()].map((path) => `:(literal)${path}`)
      console.log(`Archiving ${splitName}: ${challengePaths.size} challenge directories`)
      runGitWithRetry(
        ["-c", "core.protectNTFS=false", "archive", "--format=tar", `--output=${archive}`, "HEAD", "--", ...pathspecs],
        staging,
        `${splitName} archive`,
      )
      const skippedLinks = await extractTar(archive, staging, pathMap)
      if (skippedLinks > 0) console.log(`${splitName} archive: skipped ${skippedLinks} non-portable links`)
      await unlink(archive)
    }

    for (const { datasetFile, rewritten } of datasets) {
      await writeFile(resolve(staging, datasetFile), `${JSON.stringify(rewritten, null, 2)}\n`, "utf8")
    }
    await rm(resolve(staging, ".git"), { recursive: true, force: true })
    for (const file of selectedDatasetFiles(split)) {
      if (!existsSync(resolve(staging, file))) throw new Error(`NYU dataset setup did not produce ${file}`)
    }

    if (existsSync(target)) await rm(target, { recursive: true, force: true })
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }

  console.log(`NYU CTF Bench ready: ${target}`)
  for (const file of selectedDatasetFiles(split)) console.log(`${file}: ${resolve(target, file)}`)
  let count = 0
  for (const file of selectedDatasetFiles(split)) {
    const raw = JSON.parse(await readFile(resolve(target, file), "utf8"))
    count += datasetEntries(raw).length
  }
  console.log(`Exported challenge directories: ${count}`)
}

main().catch((error) => {
  console.error(`NYU CTF Bench setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
