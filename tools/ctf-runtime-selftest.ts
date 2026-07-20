import { tool } from "@opencode-ai/plugin"
import { createRuntimeClientForServer } from "../src/sdk.ts"
import { loadCtfTools } from "../src/ctf-tools.ts"
import { diagnoseToolVisibility, summarizeRuntimeToolRegistry } from "../src/plugin.ts"
import { resolveEnabledPacks, toolAllowedForAgent } from "../src/tool-packs.ts"

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

    const enabledPacks = resolveEnabledPacks()
    const exportedTools = await loadCtfTools({ packs: [...enabledPacks] })
    const summary = summarizeRuntimeToolRegistry({
      configPath: null,
      enabledPacks,
      tools: exportedTools,
      teamModeEnabled: false,
    })
    const exportedNames = summary.exportedToolNames
    const expectedFastSentinels = ["ctf-route-plan", "ctf-web-probe", "ctf-python-inline"]
    const missingFastSentinels = expectedFastSentinels.filter((name) => !exportedNames.includes(name))
    const fastVisibleNames = summary.fastVisibleToolNames
    const liveAgentNames = (agents.data ?? []).map((agent) => agent.name)
    const sentinelDiagnoses = Object.fromEntries(
      expectedFastSentinels.map((toolName) => [
        toolName,
        diagnoseToolVisibility({ summary, toolName, agentSurface: "ctf-fast" }),
      ]),
    )
    const likelyCause = missingFastSentinels.length
      ? "plugin_registry_missing_tools"
      : "likely_host_schema_not_injected"

    const payload = {
      ok: true,
      serverUrl: args.serverUrl,
      sessionID,
      agentCount: agents.data?.length ?? 0,
      hasDailyAgent: (agents.data ?? []).some((agent) => agent.name === agentName),
      todoCount: todos.data?.length ?? 0,
      mcpServerCount: mcpStatus.data ? Object.keys(mcpStatus.data).length : 0,
      exportedToolCount: exportedNames.length,
      ctfExportedToolCount: summary.ctfToolCount,
      fastVisibleToolCount: fastVisibleNames.length,
      expectedFastSentinels,
      missingFastSentinels,
      enabledPacks: [...enabledPacks].sort(),
      liveAgentNames,
      sentinelDiagnoses,
      hostSchemaInspection: "not_available_repo_local",
      likelyCause,
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
          `enabledPacks: ${payload.enabledPacks.join(", ")}`,
          `exportedToolCount: ${payload.exportedToolCount}`,
          `ctfExportedToolCount: ${payload.ctfExportedToolCount}`,
          `fastVisibleToolCount: ${payload.fastVisibleToolCount}`,
          `expectedFastSentinels: ${payload.expectedFastSentinels.join(", ")}`,
          `missingFastSentinels: ${payload.missingFastSentinels.length ? payload.missingFastSentinels.join(", ") : "none"}`,
          `likelyCause: ${payload.likelyCause}`,
          `hostSchemaInspection: ${payload.hostSchemaInspection}`,
          `liveAgents: ${payload.liveAgentNames.join(", ")}`,
          "sentinelDiagnoses:",
          ...Object.entries(payload.sentinelDiagnoses).flatMap(([toolName, diagnosis]) => [
            `  - ${toolName}: ${diagnosis.category}`,
            ...diagnosis.reasons.map((reason) => `      because: ${reason}`),
            `      next_action: ${diagnosis.nextAction}`,
          ]),
          "promptAsync: submitted",
          "note: exported tool counts come from this repo's plugin loader; if the live session still cannot see ctf-* tools, compare this output against the host/runtime tool schema bridge.",
        ].join("\n")
  },
})
