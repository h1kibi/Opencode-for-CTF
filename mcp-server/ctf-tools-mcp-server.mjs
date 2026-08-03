#!/usr/bin/env node
/**
 * CTF Tools MCP Server - exposes ctf-* plugin tools as MCP tools.
 *
 * OpenCode's plugin Hooks.tool registry does not inject custom tools into the
 * LLM function list. Custom tools must be exposed through the MCP protocol.
 * This server bridges the gap: it loads the same bundled/source tool
 * definitions the plugin uses and exposes them through stdio MCP transport.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { zodToJsonSchema } from "zod-to-json-schema"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// ---- Tool loading (mirrors src/ctf-tools.ts discovery) ----

function isToolDefinition(value) {
  return typeof value === "object" && value !== null && typeof value.execute === "function"
}

async function resolveRepoRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(scriptDir, "..")
}

async function firstExistingToolRoot(repoRoot) {
  const candidates = [
    path.join(repoRoot, "dist", "plugin", "tools"),
    path.join(repoRoot, "plugin", "tools"),
    path.join(repoRoot, "tools"),
  ]
  for (const candidate of candidates) {
    try {
      await readdir(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

async function discoverToolFiles(toolRoot) {
  const files = []

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "lib") continue
        await walk(path.join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue
      if (entry.name.endsWith(".d.ts")) continue

      const filePath = path.join(dir, entry.name)
      files.push({
        name: entry.name.replace(/\.(ts|js)$/, ""),
        path: filePath,
        relative: path.relative(toolRoot, filePath),
      })
    }
  }

  await walk(toolRoot)
  files.sort((a, b) => a.name.localeCompare(b.name) || a.relative.localeCompare(b.relative))
  return files
}

async function loadAllTools() {
  const repoRoot = await resolveRepoRoot()
  const toolRoot = await firstExistingToolRoot(repoRoot)
  const entries = toolRoot ? await discoverToolFiles(toolRoot) : []

  const tools = {}
  for (const entry of entries) {
    const name = entry.name
    // Only expose ctf-* and archive-* tools; skip internal/team tools.
    if (!name.startsWith("ctf-") && !name.startsWith("archive-")) continue
    try {
      const module = await import(pathToFileURL(entry.path).href)
      if (isToolDefinition(module.default)) {
        tools[name] = module.default
      }
    } catch (error) {
      console.warn(
        `[ctf-mcp] failed to load ${entry.relative}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  return tools
}

// ---- Zod to JSON Schema helper ----

function argsToJsonSchema(zodArgs) {
  if (!zodArgs || typeof zodArgs !== "object") return { type: "object", properties: {} }
  try {
    const schema = zodToJsonSchema(zodArgs, { target: "openApi3" })
    if (schema && typeof schema === "object") {
      const { $schema, ...rest } = schema
      return rest
    }
    return schema
  } catch {
    return { type: "object", properties: {} }
  }
}

// ---- MCP Server ----

async function main() {
  const tools = await loadAllTools()
  const toolNames = Object.keys(tools).sort()
  console.error(
    `[ctf-mcp] loaded ${toolNames.length} tools: ` +
      `${toolNames.slice(0, 8).join(", ")}${toolNames.length > 8 ? "..." : ""}`,
  )

  const server = new Server(
    { name: "ctf-tools", version: "0.1.0" },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolList = toolNames.map((name) => {
      const tool = tools[name]
      return {
        name,
        description: tool.description || name,
        inputSchema: argsToJsonSchema(tool.args),
      }
    })
    return { tools: toolList }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = tools[name]
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      }
    }
    try {
      const context = {
        sessionID: "mcp-session",
        messageID: "mcp-message",
        agent: "ctf-tools-mcp",
        directory: process.cwd(),
        worktree: process.cwd(),
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      }
      const result = await tool.execute(args ?? {}, context)
      const text =
        typeof result === "string"
          ? result
          : result && typeof result === "object" && "output" in result
            ? result.output
            : JSON.stringify(result, null, 2)
      return { content: [{ type: "text", text }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: "text", text: `Tool ${name} failed: ${message}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ctf-mcp] server ready on stdio")
}

main().catch((error) => {
  console.error("[ctf-mcp] fatal:", error)
  process.exit(1)
})
