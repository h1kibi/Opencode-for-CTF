/** Type declarations for scripts/lib/tool-checks.mjs (shared doctor data + runners). */

export type ToolCheck = {
  group: string
  name: string
  command: string
  args?: string[]
  required?: boolean
  note?: string
  okWhen?: RegExp
  shell?: boolean
  env?: Record<string, string>
  localWindows?: Array<{ command: string; args?: string[]; pathOnly?: boolean; shell?: boolean }>
}

export type ToolCheckResult = ToolCheck & {
  ok: boolean
  status: number | null
  preview: string
}

export const TOOL_CHECK_GROUPS: string[]

export const TOOL_CHECKS: ToolCheck[]

export function toolCheckExists(check: ToolCheck): boolean

export function runToolChecks(checks?: ToolCheck[]): Map<string, { found: string[]; missing: string[] }>

export function runToolChecksDetailed(checks?: ToolCheck[], opts?: { env?: Record<string, string> }): ToolCheckResult[]
