import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type PluginHealthReport = {
  schemaVersion?: number
  writtenAt?: string
  source?: string
  state?: string
  pluginDiagnostic?: {
    pluginImportOk?: boolean
    pluginImportError?: string | null
    nextAction?: string
  }
  pluginImportOk?: boolean
  pluginImportError?: string | null
  pluginRuntimeImportOk?: boolean
  pluginRuntimeImportError?: string | null
  [key: string]: unknown
}

export type PluginHealthSummary = {
  path: string
  present: boolean
  writtenAt: string | null
  source: string | null
  state: string | null
  pluginImportOk: boolean | null
  pluginImportError: string | null
  nextAction: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

export function opencodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) return path.resolve(process.env.OPENCODE_CONFIG_DIR)
  return path.join(os.homedir(), ".config", "opencode")
}

export function pluginHealthFilePath(configDir = opencodeConfigDir()) {
  return path.join(configDir, "opencode-for-ctf.plugin-health.json")
}

export function summarizePluginHealthReport(
  report: PluginHealthReport | null | undefined,
  configDir = opencodeConfigDir(),
): PluginHealthSummary {
  const file = pluginHealthFilePath(configDir)
  const diagnostic = isRecord(report?.pluginDiagnostic) ? report.pluginDiagnostic : {}
  return {
    path: file,
    present: Boolean(report),
    writtenAt: asOptionalString(report?.writtenAt),
    source: asOptionalString(report?.source),
    state: asOptionalString(report?.state),
    pluginImportOk:
      asOptionalBoolean(diagnostic.pluginImportOk) ??
      asOptionalBoolean(report?.pluginImportOk) ??
      asOptionalBoolean(report?.pluginRuntimeImportOk),
    pluginImportError:
      asOptionalString(diagnostic.pluginImportError) ??
      asOptionalString(report?.pluginImportError) ??
      asOptionalString(report?.pluginRuntimeImportError),
    nextAction: asOptionalString(diagnostic.nextAction),
  }
}

export async function readPluginHealthReport(configDir = opencodeConfigDir()): Promise<PluginHealthReport | null> {
  const file = pluginHealthFilePath(configDir)
  if (!existsSync(file)) return null
  const parsed = JSON.parse(await readFile(file, "utf8")) as unknown
  if (!isRecord(parsed)) throw new Error(`Invalid plugin health report: expected object in ${file}`)
  return parsed as PluginHealthReport
}

export async function readPluginHealthSummary(configDir = opencodeConfigDir()): Promise<PluginHealthSummary> {
  return summarizePluginHealthReport(await readPluginHealthReport(configDir), configDir)
}
