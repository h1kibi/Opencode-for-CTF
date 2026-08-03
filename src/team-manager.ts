/**
 * Legacy team manager compatibility layer.
 *
 * This module preserves the older member/task/message-oriented team state API.
 * The canonical Team Mode runtime now lives under `src/team/` and is exposed
 * through `src/team-runtime.ts` as the run/job orchestration façade.
 *
 * Keep this layer only for compatibility with older call sites or migration
 * helpers. New Team Mode behavior should be implemented against the run/job
 * model rather than extending this file.
 */

import { teamStateFile } from "./paths.ts"
import { atomicUpdateJsonFile, loadJsonFile, nowIso } from "./state-store.ts"
import { withFileLock } from "./file-lock.ts"
import type { TeamMember, TeamMessage, TeamState, TeamTask, TeamTaskStatus } from "./types.ts"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { randomUUID } from "node:crypto"

export type TeamRuntimeVisibility = {
  surface?: "ctf-fast" | "ctf-expert"
  pluginToolCount?: number
  expectedSkills?: string[]
  externalSkillsEnabled?: boolean
  /** Full list of plugin-exported tool names to explicitly enable in child sessions. */
  exportedToolNames?: string[]
}

function createEmptyState(teamId: string, leadSessionID: string, directory: string, challengeSlug?: string): TeamState {
  const now = nowIso()
  return {
    version: 1,
    teamId,
    leadSessionID,
    directory,
    challengeSlug,
    members: [],
    tasks: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

function statePath(worktree: string, directory: string, teamId: string) {
  return teamStateFile(worktree, directory, teamId)
}

async function loadTeamState(
  worktree: string,
  directory: string,
  teamId: string,
  leadSessionID: string,
  challengeSlug?: string,
) {
  return loadJsonFile<TeamState>(
    statePath(worktree, directory, teamId),
    createEmptyState(teamId, leadSessionID, directory, challengeSlug),
  )
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`
}

export async function createTeam(args: {
  worktree: string
  directory: string
  leadSessionID: string
  name: string
  challengeSlug?: string
}) {
  const teamId = args.name.replace(/[^A-Za-z0-9._-]/g, "_").toLowerCase() || makeId("team")
  const path = statePath(args.worktree, args.directory, teamId)
  return atomicUpdateJsonFile<TeamState>(
    path,
    createEmptyState(teamId, args.leadSessionID, args.directory, args.challengeSlug),
    (s) => s,
  )
}

export async function addMember(args: {
  worktree: string
  directory: string
  teamId: string
  leadSessionID: string
  memberName: string
  agent: string
  description?: string
}) {
  const path = statePath(args.worktree, args.directory, args.teamId)
  return atomicUpdateJsonFile<TeamState>(
    path,
    createEmptyState(args.teamId, args.leadSessionID, args.directory),
    (state) => {
      const now = nowIso()
      const member: TeamMember = {
        id: makeId("member"),
        name: args.memberName,
        role: "member",
        agent: args.agent,
        status: "idle",
        description: args.description,
        createdAt: now,
        updatedAt: now,
      }
      state.members.push(member)
      return state
    },
  )
}

export async function listTeamState(args: {
  worktree: string
  directory: string
  teamId: string
  leadSessionID: string
}) {
  return loadTeamState(args.worktree, args.directory, args.teamId, args.leadSessionID)
}

export async function sendTeamMessage(args: {
  worktree: string
  directory: string
  teamId: string
  leadSessionID: string
  from: string
  to: string
  text: string
}) {
  const path = statePath(args.worktree, args.directory, args.teamId)
  return atomicUpdateJsonFile<TeamState>(
    path,
    createEmptyState(args.teamId, args.leadSessionID, args.directory),
    (state) => {
      const message: TeamMessage = {
        id: makeId("msg"),
        from: args.from,
        to: args.to,
        text: args.text,
        createdAt: nowIso(),
      }
      state.messages.push(message)
      return state
    },
  )
}

export async function createMemberTask(args: {
  client: OpencodeClient
  worktree: string
  directory: string
  teamId: string
  leadSessionID: string
  memberId: string
  title: string
  prompt: string
  runtimeVisibility?: TeamRuntimeVisibility
}) {
  // Step 1: Find the member and create a session (no lock needed — API call)
  const path = statePath(args.worktree, args.directory, args.teamId)
  const state = await loadTeamState(args.worktree, args.directory, args.teamId, args.leadSessionID)
  const member = state.members.find((item) => item.id === args.memberId)
  if (!member) throw new Error(`member not found: ${args.memberId}`)

  if (!member.sessionID) {
    const session = await args.client.session.create({
      body: { parentID: args.leadSessionID, title: `[team] ${member.name}` },
      query: { directory: args.directory },
    })
    member.sessionID = session.data?.id
  }

  if (!member.sessionID) throw new Error(`failed to create member session for ${member.name}`)

  const runtimeLines = [
    args.runtimeVisibility ? `Expected runtime surface: ${args.runtimeVisibility.surface ?? "ctf-fast"}` : "",
    args.runtimeVisibility ? `Expected plugin-visible tools: ${args.runtimeVisibility.pluginToolCount ?? 0}` : "",
    args.runtimeVisibility
      ? `external_skills enabled: ${args.runtimeVisibility.externalSkillsEnabled ? "yes" : "no"}`
      : "",
    args.runtimeVisibility && args.runtimeVisibility.expectedSkills?.length
      ? `Expected skills catalog entries: ${args.runtimeVisibility.expectedSkills.join(", ")}`
      : args.runtimeVisibility
        ? "Expected skills catalog entries: (none detected by plugin startup diagnostics)"
        : "",
  ].filter(Boolean)

  // Build explicit tool-enablement map for plugin tools.
  // The host may only inject built-in tools into subagent sessions by default;
  // plugin tools (ctf-*, archive-*, seckb_*, cvekb_*, anysearch_*) need to be
  // explicitly listed as `true` in the `tools` parameter.
  const childTools: Record<string, boolean> = {}
  const exported = args.runtimeVisibility?.exportedToolNames
  if (exported && exported.length > 0) {
    for (const name of exported) {
      if (
        name.startsWith("ctf-") ||
        name.startsWith("archive-") ||
        name.startsWith("seckb_") ||
        name.startsWith("cvekb_") ||
        name.startsWith("anysearch_")
      ) {
        childTools[name] = true
      }
    }
  }
  // Always disable destructive / re-entrant tools for subagents.
  childTools["task"] = false
  childTools["edit"] = false
  childTools["write"] = false
  childTools["apply_patch"] = false

  await args.client.session.promptAsync({
    path: { id: member.sessionID },
    query: { directory: args.directory },
    body: {
      agent: member.agent,
      tools: Object.keys(childTools).length > 0 ? childTools : undefined,
      parts: [
        {
          type: "text",
          text: [runtimeLines.length ? runtimeLines.join("\n") : "", args.prompt].filter(Boolean).join("\n\n"),
        },
      ],
    },
  })

  // Step 2: Atomically update the state with new task + member status
  const now = nowIso()
  return atomicUpdateJsonFile<TeamState>(
    path,
    createEmptyState(args.teamId, args.leadSessionID, args.directory),
    (state) => {
      const target = state.members.find((m) => m.id === args.memberId)
      if (!target) return state

      const task: TeamTask = {
        id: makeId("task"),
        memberId: target.id,
        title: args.title,
        prompt: args.prompt,
        status: "running",
        createdAt: now,
        updatedAt: now,
      }
      target.status = "busy"
      target.updatedAt = now
      state.tasks.push(task)
      return state
    },
  )
}

export async function updateTaskStatus(args: {
  worktree: string
  directory: string
  teamId: string
  leadSessionID: string
  taskId: string
  status: TeamTaskStatus
  resultSummary?: string
}) {
  const path = statePath(args.worktree, args.directory, args.teamId)
  return atomicUpdateJsonFile<TeamState>(
    path,
    createEmptyState(args.teamId, args.leadSessionID, args.directory),
    (state) => {
      const task = state.tasks.find((item) => item.id === args.taskId)
      if (!task) throw new Error(`task not found: ${args.taskId}`)
      const member = state.members.find((item) => item.id === task.memberId)
      const now = nowIso()

      task.status = args.status
      task.updatedAt = now
      if (args.resultSummary !== undefined) task.resultSummary = args.resultSummary

      if (member) {
        member.status = args.status === "running" ? "busy" : args.status === "blocked" ? "blocked" : "done"
        member.updatedAt = now
      }

      return state
    },
  )
}
