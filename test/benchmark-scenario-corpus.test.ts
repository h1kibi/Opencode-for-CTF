import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { benchmarkFamilies } from "../packages/ctf-benchmark-core/src/index.js"

type TraceContract = {
  requiredOrdered: string[]
  forbidden?: string[]
}

type ScenarioManifest = {
  schemaVersion: number
  id: string
  family: string
  passArtifact: string
  failArtifact: string
  traceContract?: {
    pass: TraceContract
    fail: TraceContract
  }
}

const root = process.cwd()
const benchmarkRoot = join(root, "benchmarks")
const outputFilePattern = /^(notes|solve|exploit|agent_flag|output|log|result)\.(md|txt|py|js|json|sage)$/i

function discoverScenarioFiles(dir: string): string[] {
  const files: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    const full = join(dir, entry.name)
    if (entry.isFile() && entry.name === "scenario.json") files.push(full)
    else if (entry.isDirectory()) files.push(...discoverScenarioFiles(full))
  }
  return files.sort()
}

function isInside(parent: string, target: string): boolean {
  const rel = relative(parent, target)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function loadScenario(file: string): ScenarioManifest {
  return JSON.parse(readFileSync(file, "utf8")) as ScenarioManifest
}

function hasCheckerArtifact(dir: string): boolean {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }

  return entries.some((entry) => {
    if (entry.isFile()) return outputFilePattern.test(entry.name)
    if (entry.isDirectory() && !entry.name.startsWith(".")) return hasCheckerArtifact(join(dir, entry.name))
    return false
  })
}

describe("benchmark scenario corpus", () => {
  const scenarioFiles = discoverScenarioFiles(benchmarkRoot)

  it("has a registered, unique id for every scenario", () => {
    const registered = new Set(benchmarkFamilies.map((entry) => `${entry.family}/${entry.name}`))
    const seen = new Set<string>()
    const errors: string[] = []

    for (const file of scenarioFiles) {
      const manifest = loadScenario(file)
      if (manifest.schemaVersion !== 1) errors.push(`${manifest.id}: schemaVersion must be 1`)
      if (seen.has(manifest.id)) errors.push(`duplicate scenario id: ${manifest.id}`)
      seen.add(manifest.id)
      if (!registered.has(manifest.id)) errors.push(`${manifest.id}: scenario id is not registered`)
    }

    expect(errors).toEqual([])
  })

  it("keeps scenario family and id aligned with the benchmark path", () => {
    const errors: string[] = []
    for (const file of scenarioFiles) {
      const manifest = loadScenario(file)
      const scenarioDir = resolve(file, "..")
      const familyDir = resolve(scenarioDir, "..")
      const expectedFamily = relative(benchmarkRoot, familyDir).replaceAll("\\", "/")
      const expectedId = `${expectedFamily}/${relative(familyDir, scenarioDir).replaceAll("\\", "/")}`
      if (manifest.family !== expectedFamily) errors.push(`${file}: family must be ${expectedFamily}`)
      if (manifest.id !== expectedId) errors.push(`${file}: id must be ${expectedId}`)
    }
    expect(errors).toEqual([])
  })

  it("declares valid structured traces for both checker cases", () => {
    const errors: string[] = []
    for (const file of scenarioFiles) {
      const manifest = loadScenario(file)
      if (!manifest.traceContract) {
        errors.push(`${manifest.id}: traceContract is required`)
        continue
      }

      const scenarioDir = resolve(file, "..")
      for (const [label, artifact] of [
        ["passArtifact", manifest.passArtifact],
        ["failArtifact", manifest.failArtifact],
      ] as const) {
        if (isAbsolute(artifact)) errors.push(`${manifest.id}: ${label} must be relative`)
        const target = resolve(scenarioDir, artifact)
        if (!isInside(scenarioDir, target)) errors.push(`${manifest.id}: ${label} escapes scenario directory`)
      }
      if (resolve(scenarioDir, manifest.passArtifact) === resolve(scenarioDir, manifest.failArtifact)) {
        errors.push(`${manifest.id}: passArtifact and failArtifact must differ`)
      }

      for (const [label, artifact, contract] of [
        ["pass", manifest.passArtifact, manifest.traceContract.pass],
        ["fail", manifest.failArtifact, manifest.traceContract.fail],
      ] as const) {
        if (!Array.isArray(contract.requiredOrdered) || contract.requiredOrdered.some((event) => !event.trim())) {
          errors.push(`${manifest.id}: ${label} trace requires non-empty requiredOrdered events`)
        }
        if (contract.forbidden?.some((event) => !event.trim())) {
          errors.push(`${manifest.id}: ${label} trace has an empty forbidden event`)
        }

        const traceFile = join(resolve(scenarioDir, artifact), "trace.json")
        if (!existsSync(traceFile)) {
          errors.push(`${manifest.id}: ${label} trace.json is missing`)
          continue
        }
        try {
          const trace = JSON.parse(readFileSync(traceFile, "utf8")) as unknown
          if (!Array.isArray(trace)) {
            errors.push(`${manifest.id}: ${label} trace.json must contain an array`)
            continue
          }
          for (const [index, event] of trace.entries()) {
            if (!event || typeof event !== "object" || typeof (event as { event?: unknown }).event !== "string") {
              errors.push(`${manifest.id}: ${label} trace event ${index} lacks a string event field`)
            }
          }
        } catch {
          errors.push(`${manifest.id}: ${label} trace.json is invalid JSON`)
        }
      }
    }
    expect(errors).toEqual([])
  })

  it("uses in-tree checker targets with recognizable output artifacts", () => {
    const errors: string[] = []
    for (const file of scenarioFiles) {
      const manifest = loadScenario(file)
      const scenarioDir = resolve(file, "..")
      for (const [label, artifact] of [
        ["passArtifact", manifest.passArtifact],
        ["failArtifact", manifest.failArtifact],
      ] as const) {
        const target = resolve(scenarioDir, artifact)
        if (!isInside(scenarioDir, target)) {
          errors.push(`${manifest.id}: ${label} escapes scenario directory`)
          continue
        }
        if (!existsSync(target) || !statSync(target).isDirectory()) {
          errors.push(`${manifest.id}: ${label} must be an existing directory`)
          continue
        }
        if (!hasCheckerArtifact(target)) errors.push(`${manifest.id}: ${label} has no checker-recognized output`)
      }
    }
    expect(errors).toEqual([])
  })
})
