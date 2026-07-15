import path from "node:path"

export function runtimeRoot(worktree: string) {
  return path.resolve(worktree, "runtime")
}

export function runtimeStateRoot(worktree: string) {
  return path.resolve(runtimeRoot(worktree), "state")
}

export function teamStateFile(worktree: string, directory: string, teamId: string) {
  return path.resolve(runtimeStateRoot(worktree), safeDirSlug(directory), `team-${teamId}.json`)
}

export function continuationStateFile(worktree: string, sessionID: string) {
  return path.resolve(runtimeStateRoot(worktree), "continuation", `${sessionID}.json`)
}

export function continuationInterruptFile(worktree: string, directory: string) {
  return path.resolve(runtimeStateRoot(worktree), "continuation", `${safeDirSlug(directory)}.interrupt.json`)
}

export function skillMcpStateFile(worktree: string) {
  return path.resolve(runtimeStateRoot(worktree), "skill-mcp-leases.json")
}

export function safeDirSlug(directory: string) {
  return directory.replace(/[:\\/]+/g, "_").replace(/[^A-Za-z0-9._-]/g, "_")
}
