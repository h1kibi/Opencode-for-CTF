import { teamStateFile } from "./paths.ts"
import { loadJsonFile, nowIso, saveJsonFile } from "./state-store.ts"
import type { TeamMember, TeamMessage, TeamState, TeamTask, TeamTaskStatus } from "./types.ts"
import type { OpencodeClient } from "@opencode-ai/sdk"

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

async function loadTeamState(worktree: string, directory: string, teamId: string, leadSessionID: string, challengeSlug?: string) {
  return loadJsonFile<TeamState>(teamStateFile(worktree, directory, teamId), createEmptyState(teamId, leadSessionID, directory, challengeSlug))
}

async function saveTeamState(worktree: string, directory: string, state: TeamState) {
  state.updatedAt = nowIso()
  await saveJsonFile(teamStateFile(worktree, directory, state.teamId), state)
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export async function createTeam(args: {
  worktree: string
  directory: string
  leadSessionID: string
  name: string
  challengeSlug?: string
}) {
  const teamId = args.name.replace(/[^A-Za-z0-9._-]/g, "_").toLowerCase() || makeId("team")
  const state = await loadTeamState(args.worktree, args.directory, teamId, args.leadSessionID, args.challengeSlug)
  await saveTeamState(args.worktree, args.directory, state)
  return state
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
  const state = await loadTeamState(args.worktree, args.directory, args.teamId, args.leadSessionID)
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
  await saveTeamState(args.worktree, args.directory, state)
  return member
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
  const state = await loadTeamState(args.worktree, args.directory, args.teamId, args.leadSessionID)
  const message: TeamMessage = {
    id: makeId("msg"),
    from: args.from,
    to: args.to,
    text: args.text,
    createdAt: nowIso(),
  }
  state.messages.push(message)
  await saveTeamState(args.worktree, args.directory, state)
  return message
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
}) {
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

  await args.client.session.promptAsync({
    path: { id: member.sessionID },
    query: { directory: args.directory },
    body: {
      agent: member.agent,
      parts: [
        {
          type: "text",
          text: args.prompt,
        },
      ],
    },
  })

  const now = nowIso()
  const task: TeamTask = {
    id: makeId("task"),
    memberId: member.id,
    title: args.title,
    prompt: args.prompt,
    status: "running",
    createdAt: now,
    updatedAt: now,
  }
  member.status = "busy"
  member.updatedAt = now
  state.tasks.push(task)
  await saveTeamState(args.worktree, args.directory, state)
  return { member, task }
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
  const state = await loadTeamState(args.worktree, args.directory, args.teamId, args.leadSessionID)
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

  await saveTeamState(args.worktree, args.directory, state)
  return task
}
