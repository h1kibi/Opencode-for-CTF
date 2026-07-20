import { safeExec } from "./exec-utils.ts"

export type EnvCheckItem = {
  name: string
  command: string
  args: string[]
  required: boolean
  category: string
  hint: string
  purpose?: string
  fallback?: string
}

export type EnvCheckResult = EnvCheckItem & {
  ok: boolean
  version: string
}

export function firstLine(s: string) {
  return (s.split(/\r?\n/).find(Boolean) || "<no output>").slice(0, 220)
}

export async function runEnvChecks(checks: EnvCheckItem[], timeoutMs = 6000): Promise<EnvCheckResult[]> {
  const results: EnvCheckResult[] = []
  for (const check of checks) {
    const res = await safeExec(check.command, check.args, undefined, timeoutMs)
    results.push({
      ...check,
      ok: res.ok,
      version: firstLine(res.output),
    })
  }
  return results
}

export function summarizeEnvChecks(results: EnvCheckResult[]) {
  const required = results.filter((x) => x.required)
  const missingRequired = required.filter((x) => !x.ok)
  const missingOptional = results.filter((x) => !x.required && !x.ok)
  return {
    ready: missingRequired.length === 0,
    required_ok: required.filter((x) => x.ok).length,
    required_total: required.length,
    required_missing: missingRequired.map((x) => x.name),
    optional_missing: missingOptional.map((x) => x.name),
  }
}
