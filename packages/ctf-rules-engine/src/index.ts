export type RuleDocument = {
  name: string
  path: string
  summary: string
  appliesTo: string[]
}

export function inferRuleScope(path: string): string[] {
  const lower = path.toLowerCase()
  const scopes: string[] = []

  if (lower.includes("global") || lower.includes("safety")) scopes.push("all")
  if (lower.includes("web")) scopes.push("web")
  if (lower.includes("pwn")) scopes.push("pwn")
  if (lower.includes("crypto")) scopes.push("crypto")
  if (lower.includes("rev")) scopes.push("rev")
  if (lower.includes("forensics")) scopes.push("forensics")
  if (lower.includes("competition") || lower.includes("benchmark")) scopes.push("competition")

  return scopes.length > 0 ? scopes : ["all"]
}
