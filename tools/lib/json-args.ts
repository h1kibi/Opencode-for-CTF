export function parseJsonArg<T>(name: string, value: string | undefined, fallback: T): T {
  if (value === undefined || value.trim() === "") return fallback
  try {
    return JSON.parse(value) as T
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const preview = value.length > 160 ? `${value.slice(0, 157)}...` : value
    throw new Error(`invalid ${name}: expected JSON (${detail}); received ${JSON.stringify(preview)}`)
  }
}

export function parseJsonObjectArg(name: string, value: string | undefined): Record<string, unknown> {
  const parsed = parseJsonArg<unknown>(name, value, {})
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`invalid ${name}: expected a JSON object`)
  }
  return parsed as Record<string, unknown>
}

export function parseJsonArrayArg<T = unknown>(name: string, value: string | undefined): T[] {
  const parsed = parseJsonArg<unknown>(name, value, [])
  if (!Array.isArray(parsed)) throw new Error(`invalid ${name}: expected a JSON array`)
  return parsed as T[]
}

export function parseStringArrayArg(name: string, value: string | undefined): string[] {
  const parsed = parseJsonArrayArg<unknown>(name, value)
  const bad = parsed.find((item) => typeof item !== "string")
  if (bad !== undefined) throw new Error(`invalid ${name}: expected a JSON string array`)
  return parsed as string[]
}

export function objectToStringRecord(name: string, value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid ${name}: invalid env var name ${key}`)
    out[key] = String(item)
  }
  return out
}
