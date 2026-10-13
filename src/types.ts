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
  fastBudgetStartedAt?: string
  fastBudgetDeadlineAt?: string
  fastBudgetStatus?: "active" | "review" | "blocked"
  fastBudgetSummary?: string
  fastBudgetReviewSentAt?: string
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

/**
 * Lease lifecycle for a named MCP server:
 *   pending       — recorded for this session, server not owned by us yet
 *   connecting    — we hold the claim and are performing the external connect
 *   connected     — server usable by this session (we may or may not own it)
 *   disconnecting — we are performing the external disconnect
 *   unknown       — external state could not be confirmed (compensation queue)
 * `connected` (boolean) stays in sync for legacy readers.
 */
export type SkillMcpLeaseStatus = "pending" | "connecting" | "connected" | "disconnecting" | "unknown"

export type SkillMcpLease = {
  skillName: string
  sessionID: string
  serverName: string
  /** Legacy boolean — kept in sync with `status` for older readers. */
  connected: boolean
  /** Lifecycle state; absent on legacy leases (infer from `connected`). */
  status?: SkillMcpLeaseStatus
  /** ISO timestamp when the current status was entered (stale takeover window). */
  transitionAt?: string
  /** Per-attempt fencing token; only the holder may finalize the transition. */
  ownerToken?: string
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

// ---- Dynamic MCP Switch (agent-level MCP management) ----

export type ServerWeight = "light" | "medium" | "heavy"

export type ServerGroup = "recon" | "analysis" | "knowledge" | "debug"

export type CtfFamily = "web" | "pwn" | "rev" | "crypto" | "forensics" | "misc"

export type McpRequestStatus =
  | "pending"
  | "approving"
  | "activating"
  | "active"
  | "approved"
  | "activation_failed"
  | "denied"
  | "released"
  | "expired"

export type McpServerMeta = {
  id: string
  description: string
  weight: ServerWeight
  group: ServerGroup
  categories: CtfFamily[]
  config: Record<string, unknown>
  timeout?: number
  envRequired?: string[]
}

export type AgentMcpRequest = {
  id: string
  agent: string
  sessionID: string
  serverName: string
  reason: string
  status: McpRequestStatus
  activationState?: "idle" | "activating" | "active" | "released" | "failed"
  activationToken?: string
  decidedBy?: string
  decidedNote?: string
  createdAt: string
  expiresAt?: string
  updatedAt: string
}

export type AgentMcpActivationIssue = {
  id: string
  agent: string
  sessionID: string
  serverName: string
  phase: "agent_default" | "skill" | "request"
  code: string
  message: string
  createdAt: string
  updatedAt: string
}

export type AgentMcpState = {
  version: number
  activeProfiles: Array<{ agent: string; sessionID: string; serverNames: string[] }>
  requests: AgentMcpRequest[]
  activationIssues?: AgentMcpActivationIssue[]
  updatedAt: string
}
