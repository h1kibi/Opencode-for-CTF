import { mkdirSync, mkdtempSync } from "node:fs"
import { mkdir, mkdtemp } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const testWorkspaceRoot = join(repositoryRoot, "work", "test-tmp")

function ensureTestWorkspaceRoot(): void {
  mkdirSync(testWorkspaceRoot, { recursive: true })
}

export function makeTestWorkspace(prefix: string): string {
  ensureTestWorkspaceRoot()
  return mkdtempSync(join(testWorkspaceRoot, `${prefix}-`))
}

export async function makeTestWorkspaceAsync(prefix: string): Promise<string> {
  await mkdir(testWorkspaceRoot, { recursive: true })
  return mkdtemp(join(testWorkspaceRoot, `${prefix}-`))
}
