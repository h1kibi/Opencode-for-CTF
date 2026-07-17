import { tool } from "@opencode-ai/plugin"
import { createRuntimeClientForServer } from "../src/sdk.ts"

export default tool({
  description:
    "CTF runtime self-test: validate local Team Mode, continuation, and skill-MCP runtime against a running OpenCode server.",
  args: {
    serverUrl: tool.schema.string().describe("Running OpenCode server URL, e.g. http://127.0.0.1:4100"),
    testAgent: tool.schema.string().optional().describe("Agent to use for session prompt test. Default daily."),
    jsonOnly: tool.schema.boolean().optional().describe("Return JSON only. Default false."),
  },
  async execute(args, context) {
    const client = createRuntimeClientForServer(context.directory, args.serverUrl)
    const agentName = args.testAgent || "daily"

    const agents = await client.app.agents({ query: { directory: context.directory } })
    const session = await client.session.create({
      body: { title: "runtime-selftest" },
      query: { directory: context.directory },
    })
    const sessionID = session.data?.id
    if (!sessionID) throw new Error("failed to create runtime self-test session")

    await client.session.promptAsync({
      path: { id: sessionID },
      query: { directory: context.directory },
      body: {
        agent: agentName,
        parts: [
          {
            type: "text",
            text: "Output exactly: RUNTIME_SELFTEST_OK",
          },
        ],
      },
    })

    const todos = await client.session.todo({
      path: { id: sessionID },
      query: { directory: context.directory },
    })

    const mcpStatus = await client.mcp.status({ query: { directory: context.directory } })

    const payload = {
      ok: true,
      serverUrl: args.serverUrl,
      sessionID,
      agentCount: agents.data?.length ?? 0,
      hasDailyAgent: (agents.data ?? []).some((agent) => agent.name === agentName),
      todoCount: todos.data?.length ?? 0,
      mcpServerCount: mcpStatus.data ? Object.keys(mcpStatus.data).length : 0,
    }

    return args.jsonOnly
      ? JSON.stringify(payload, null, 2)
      : [
          "ctf_runtime_selftest:",
          `serverUrl: ${args.serverUrl}`,
          `sessionID: ${sessionID}`,
          `agentCount: ${payload.agentCount}`,
          `hasAgent(${agentName}): ${payload.hasDailyAgent}`,
          `todoCount: ${payload.todoCount}`,
          `mcpServerCount: ${payload.mcpServerCount}`,
          "promptAsync: submitted",
        ].join("\n")
  },
})
