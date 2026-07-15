export type TeamRole = "lead" | "member"

export type TeamTaskStatus = "pending" | "running" | "completed" | "blocked" | "cancelled"

export type TeamMember = {
  id: string
  name: string
  role: TeamRole
  agent: string
  sessionID?: string
  status: "idle" | "busy" | "done" | "blocked"
  description?: string
  createdAt: string
  updatedAt: string
}

export type TeamTask = {
  id: string
  memberId: string
  title: string
  prompt: string
  status: TeamTaskStatus
  createdAt: string
  updatedAt: string
  resultSummary?: string
}

export type TeamMessage = {
  id: string
  from: string
  to: string
  text: string
  createdAt: string
}

export type TeamState = {
  version: number
  teamId: string
  leadSessionID: string
  directory: string
  challengeSlug?: string
  members: TeamMember[]
  tasks: TeamTask[]
  messages: TeamMessage[]
  createdAt: string
  updatedAt: string
}

export type ContinuationState = {
  version: number
  sessionID: string
  directory: string
  enabled: boolean
  mode: "ctf" | "daily"
  lastMessageID?: string
  lastAgent?: string
  lastTodoSummary?: string
  lastNudgeAt?: string
  lastNudgeKey?: string
  lastFailureAt?: string
  lastFailureReason?: string
  lastSessionStatus?: "idle" | "busy" | "retry"
  idleEligible?: boolean
  pausedByUser?: boolean
  pauseReason?: "user_interrupt" | "manual_disable" | "cooldown"
  suppressUntil?: string
  createdAt: string
  updatedAt: string
}

export type ContinuationInterruptMarker = {
  version: number
  directory: string
  interruptedAt: string
}

export type SkillMcpLease = {
  skillName: string
  sessionID: string
  serverName: string
  connected: boolean
  disconnectWhenIdle?: boolean
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SkillMcpState = {
  version: number
  leases: SkillMcpLease[]
  updatedAt: string
}
