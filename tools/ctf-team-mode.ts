import { tool } from "@opencode-ai/plugin"
import { createRuntimeClient } from "../src/sdk.ts"
import {
  addMember,
  createMemberTask,
  createTeam,
  listTeamState,
  sendTeamMessage,
  updateTaskStatus,
} from "../src/team-manager.ts"

export default tool({
  description: "CTF Team Mode: create a lead/member team, assign real subagent sessions, send messages, and track task state.",
  args: {
    operation: tool.schema.string().describe("create_team | add_member | create_task | send_message | status | complete_task | block_task"),
    teamId: tool.schema.string().optional().describe("Existing team ID for non-create operations."),
    name: tool.schema.string().optional().describe("Team name for create_team or member name for add_member."),
    challengeSlug: tool.schema.string().optional().describe("Optional challenge slug when creating a team."),
    agentName: tool.schema.string().optional().describe("Subagent name for add_member, e.g. ctf-scout or ctf-oracle."),
    memberId: tool.schema.string().optional().describe("Member ID for create_task."),
    title: tool.schema.string().optional().describe("Task title for create_task."),
    prompt: tool.schema.string().optional().describe("Task prompt for create_task."),
    from: tool.schema.string().optional().describe("Sender for send_message."),
    to: tool.schema.string().optional().describe("Recipient for send_message."),
    text: tool.schema.string().optional().describe("Message text for send_message."),
    taskId: tool.schema.string().optional().describe("Task ID for complete_task or block_task."),
    resultSummary: tool.schema.string().optional().describe("Optional result summary for complete_task or block_task."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const client = createRuntimeClient(context.directory)

    if (args.operation === "create_team") {
      if (!args.name) return "BLOCK: name is required for create_team"
      const state = await createTeam({
        worktree: context.worktree,
        directory: context.directory,
        leadSessionID: context.sessionID,
        name: args.name,
        challengeSlug: args.challengeSlug,
      })
      return args.jsonOnly ? JSON.stringify(state, null, 2) : [
        "ctf_team_mode:",
        "operation: create_team",
        `teamId: ${state.teamId}`,
        `leadSessionID: ${state.leadSessionID}`,
        `members: ${state.members.length}`,
      ].join("\n")
    }

    if (!args.teamId) return "BLOCK: teamId is required for this operation"

    if (args.operation === "add_member") {
      if (!args.name || !args.agentName) return "BLOCK: name and agentName are required for add_member"
      const member = await addMember({
        worktree: context.worktree,
        directory: context.directory,
        teamId: args.teamId,
        leadSessionID: context.sessionID,
        memberName: args.name,
        agent: args.agentName,
      })
      return args.jsonOnly ? JSON.stringify(member, null, 2) : [
        "ctf_team_mode:",
        "operation: add_member",
        `teamId: ${args.teamId}`,
        `memberId: ${member.id}`,
        `name: ${member.name}`,
        `agent: ${member.agent}`,
      ].join("\n")
    }

    if (args.operation === "create_task") {
      if (!args.memberId || !args.title || !args.prompt) return "BLOCK: memberId, title, and prompt are required for create_task"
      const result = await createMemberTask({
        client,
        worktree: context.worktree,
        directory: context.directory,
        teamId: args.teamId,
        leadSessionID: context.sessionID,
        memberId: args.memberId,
        title: args.title,
        prompt: args.prompt,
      })
      return args.jsonOnly ? JSON.stringify(result, null, 2) : [
        "ctf_team_mode:",
        "operation: create_task",
        `teamId: ${args.teamId}`,
        `memberId: ${result.member.id}`,
        `memberName: ${result.member.name}`,
        `agent: ${result.member.agent}`,
        `memberSessionID: ${result.member.sessionID}`,
        `taskId: ${result.task.id}`,
        `taskStatus: ${result.task.status}`,
      ].join("\n")
    }

    if (args.operation === "send_message") {
      if (!args.from || !args.to || !args.text) return "BLOCK: from, to, and text are required for send_message"
      const message = await sendTeamMessage({
        worktree: context.worktree,
        directory: context.directory,
        teamId: args.teamId,
        leadSessionID: context.sessionID,
        from: args.from,
        to: args.to,
        text: args.text,
      })
      return args.jsonOnly ? JSON.stringify(message, null, 2) : [
        "ctf_team_mode:",
        "operation: send_message",
        `messageId: ${message.id}`,
        `from: ${message.from}`,
        `to: ${message.to}`,
      ].join("\n")
    }

    if (args.operation === "complete_task" || args.operation === "block_task") {
      if (!args.taskId) return "BLOCK: taskId is required for task status update"
      const task = await updateTaskStatus({
        worktree: context.worktree,
        directory: context.directory,
        teamId: args.teamId,
        leadSessionID: context.sessionID,
        taskId: args.taskId,
        status: args.operation === "complete_task" ? "completed" : "blocked",
        resultSummary: args.resultSummary,
      })
      return args.jsonOnly ? JSON.stringify(task, null, 2) : [
        "ctf_team_mode:",
        `operation: ${args.operation}`,
        `taskId: ${task.id}`,
        `status: ${task.status}`,
        `resultSummary: ${task.resultSummary ?? ""}`,
      ].join("\n")
    }

    const state = await listTeamState({
      worktree: context.worktree,
      directory: context.directory,
      teamId: args.teamId,
      leadSessionID: context.sessionID,
    })
    return args.jsonOnly ? JSON.stringify(state, null, 2) : [
      "ctf_team_mode:",
      "operation: status",
      `teamId: ${state.teamId}`,
      `members: ${state.members.length}`,
      `tasks: ${state.tasks.length}`,
      ...state.members.map((member) => `- member=${member.id} name=${member.name} agent=${member.agent} status=${member.status} session=${member.sessionID ?? ""}`),
      ...state.tasks.map((task) => `- task=${task.id} member=${task.memberId} status=${task.status} title=${task.title}`),
    ].join("\n")
  },
})
