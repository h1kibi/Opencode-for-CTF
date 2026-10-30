import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { safeExec } from "./exec-utils.ts"

export type ArchiveEntry = { name: string; size?: number }

async function exists(command: string) {
  const result = await safeExec(process.platform === "win32" ? "where" : "which", [command], {
    timeoutMs: 5000,
    maxBuffer: 64 * 1024,
  })
  return result.ok
}

async function find7z() {
  if (await exists("7z")) return "7z"
  if (process.platform === "win32") {
    for (const candidate of ["C:\\Program Files\\7-Zip\\7z.exe", "C:\\Program Files (x86)\\7-Zip\\7z.exe"]) {
      const result = await safeExec(candidate, ["-h"], { timeoutMs: 5000, maxBuffer: 64 * 1024 })
      if (result.ok) return candidate
    }
  }
  return ""
}

function parse7z(output: string): ArchiveEntry[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(\d+)\s+\d*\s+(.+)$/)
    return match?.[2] ? [{ name: match[2].trim(), size: Number(match[1]) }] : []
  })
}

export async function listArchiveEntries(target: string): Promise<ArchiveEntry[]> {
  const failures: string[] = []
  if (await exists("unzip")) {
    const result = await safeExec("unzip", ["-Z", "-1", target], {
      cwd: path.dirname(target),
      timeoutMs: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (result.ok)
      return result.output === "<no output>"
        ? []
        : result.output
            .split(/\r?\n/)
            .filter(Boolean)
            .map((name) => ({ name }))
    failures.push(`unzip: ${result.output}`)
  }
  const sevenZip = await find7z()
  if (sevenZip) {
    const result = await safeExec(sevenZip, ["l", "-ba", target], {
      cwd: path.dirname(target),
      timeoutMs: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (result.ok) return parse7z(result.output)
    failures.push(`7z: ${result.output}`)
  }
  if (await exists("jar")) {
    const result = await safeExec("jar", ["tf", target], {
      cwd: path.dirname(target),
      timeoutMs: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (result.ok)
      return result.output === "<no output>"
        ? []
        : result.output
            .split(/\r?\n/)
            .filter(Boolean)
            .map((name) => ({ name }))
    failures.push(`jar: ${result.output}`)
  }
  throw new Error(
    `no supported external archive listing backend is available (${failures.join("; ") || "install unzip, 7z, or jar"})`,
  )
}

export async function extractArchiveToTemp(
  target: string,
  workspaceRoot: string,
): Promise<{ directory: string; cleanup: () => Promise<void> }> {
  const directory = path.join(workspaceRoot, "work", ".tmp", `ctf-archive-${randomUUID()}`)
  await mkdir(directory, { recursive: true })
  try {
    if (await exists("unzip")) {
      const result = await safeExec("unzip", ["-q", target, "-d", directory], {
        cwd: path.dirname(target),
        timeoutMs: 120000,
        maxBuffer: 2 * 1024 * 1024,
      })
      if (result.ok) return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
    }
    const sevenZip = await find7z()
    if (sevenZip) {
      const result = await safeExec(sevenZip, ["x", target, `-o${directory}`, "-y"], {
        cwd: path.dirname(target),
        timeoutMs: 120000,
        maxBuffer: 2 * 1024 * 1024,
      })
      if (result.ok) return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
    }
    if (await exists("jar")) {
      const result = await safeExec("jar", ["xf", target], {
        cwd: directory,
        timeoutMs: 120000,
        maxBuffer: 2 * 1024 * 1024,
      })
      if (result.ok) return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
    }
    if (process.platform === "win32") {
      const result = await safeExec(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
          target,
          directory,
        ],
        { timeoutMs: 120000, maxBuffer: 2 * 1024 * 1024 },
      )
      if (result.ok) return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) }
    }
    throw new Error(
      "no supported external archive extraction backend is available (install unzip, 7z, jar, or PowerShell Expand-Archive)",
    )
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function readArchiveEntry(
  target: string,
  entryName: string,
  workspaceRoot: string,
  maxBytes = 64 * 1024 * 1024,
): Promise<Buffer> {
  const extracted = await extractArchiveToTemp(target, workspaceRoot)
  try {
    const candidate = path.resolve(extracted.directory, entryName.replace(/\\/g, "/"))
    const base = path.resolve(extracted.directory)
    const relative = path.relative(base, candidate)
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error(`archive entry escapes extraction root: ${entryName}`)
    const data = await readFile(candidate)
    if (data.length > maxBytes) throw new Error(`archive entry exceeds ${maxBytes} byte limit: ${entryName}`)
    return data
  } finally {
    await extracted.cleanup()
  }
}

export async function archiveFileNames(target: string, prefix = "") {
  const entries = await listArchiveEntries(target)
  return entries.filter((entry) => !prefix || entry.name.startsWith(prefix)).map((entry) => entry.name)
}
