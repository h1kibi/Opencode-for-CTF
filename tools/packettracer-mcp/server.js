import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const BIN_DIR = process.env.PACKET_TRACER_BIN || "C:\\Program Files\\Cisco Packet Tracer 9.0.0\\bin";
const EXE_PATH = process.env.PACKET_TRACER_EXE || path.join(BIN_DIR, "PacketTracer.exe");
const WORKSPACE = process.env.PACKET_TRACER_WORKSPACE || "C:\\Users\\Administrator\\Desktop\\PacketTracerLabs";

const TOOL_NAMES = ["packettracer_status", "packettracer_launch", "packettracer_open_file", "packettracer_list_projects", "packettracer_prepare_workspace", "packettracer_list_bin"];

const launchSchema = z.object({
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
});

const openFileSchema = z.object({
  file: z.string(),
});

const listProjectsSchema = z.object({
  dir: z.string().optional(),
  recursive: z.boolean().optional().default(false),
});

const prepareWorkspaceSchema = z.object({
  name: z.string().min(1),
});

function ensureWithinWorkspace(targetPath) {
  const resolvedWorkspace = path.resolve(WORKSPACE);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedWorkspace, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay within workspace: ${resolvedWorkspace}`);
  }
  return resolvedTarget;
}

function ensurePktFile(targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  if (![".pkt", ".pka"].includes(ext)) {
    throw new Error("Only .pkt and .pka files are supported");
  }
}

function textResult(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function listFilesRecursive(dir, allowedExts, maxEntries = 500) {
  const results = [];
  function walk(current) {
    if (results.length >= maxEntries) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (results.length >= maxEntries) return;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (allowedExts.includes(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(fullPath);
        results.push({
          path: fullPath,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        });
      }
    }
  }
  walk(dir);
  return results;
}

function spawnDetached(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return child.pid;
}

const server = new Server(
  {
    name: "packettracer-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "packettracer_status",
      description: "Check Cisco Packet Tracer installation and workspace status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "packettracer_launch",
      description: "Launch Cisco Packet Tracer with optional arguments.",
      inputSchema: {
        type: "object",
        properties: {
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
        },
      },
    },
    {
      name: "packettracer_open_file",
      description: "Open a .pkt or .pka file inside the configured workspace.",
      inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
          file: { type: "string" },
        },
      },
    },
    {
      name: "packettracer_list_projects",
      description: "List .pkt and .pka files in the workspace.",
      inputSchema: {
        type: "object",
        properties: {
          dir: { type: "string" },
          recursive: { type: "boolean" },
        },
      },
    },
    {
      name: "packettracer_prepare_workspace",
      description: "Create a project folder inside the Packet Tracer workspace.",
      inputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
        },
      },
    },
    {
      name: "packettracer_list_bin",
      description: "List key executable files inside the Packet Tracer bin directory.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};

  if (!TOOL_NAMES.includes(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }

  switch (name) {
    case "packettracer_status": {
      const exeExists = fs.existsSync(EXE_PATH);
      const binExists = fs.existsSync(BIN_DIR);
      const workspaceExists = fs.existsSync(WORKSPACE);
      const pktFiles = workspaceExists
        ? listFilesRecursive(WORKSPACE, [".pkt", ".pka"], 100).length
        : 0;
      return textResult(JSON.stringify({
        binDir: BIN_DIR,
        binExists,
        exePath: EXE_PATH,
        exeExists,
        workspace: WORKSPACE,
        workspaceExists,
        projectFileCount: pktFiles,
      }, null, 2));
    }

    case "packettracer_launch": {
      const parsed = launchSchema.parse(args);
      if (!fs.existsSync(EXE_PATH)) {
        throw new Error(`PacketTracer executable not found: ${EXE_PATH}`);
      }
      const cwd = parsed.cwd ? ensureWithinWorkspace(parsed.cwd) : WORKSPACE;
      const pid = spawnDetached(EXE_PATH, parsed.args, cwd);
      return textResult(`Launched Packet Tracer (PID ${pid}) using cwd ${cwd}`);
    }

    case "packettracer_open_file": {
      const parsed = openFileSchema.parse(args);
      const candidate = ensureWithinWorkspace(parsed.file);
      ensurePktFile(candidate);
      if (!fs.existsSync(candidate)) {
        throw new Error(`Project file not found: ${candidate}`);
      }
      const pid = spawnDetached(EXE_PATH, [candidate], path.dirname(candidate));
      return textResult(`Opened ${candidate} in Packet Tracer (PID ${pid})`);
    }

    case "packettracer_list_projects": {
      const parsed = listProjectsSchema.parse(args);
      const dir = parsed.dir ? ensureWithinWorkspace(parsed.dir) : WORKSPACE;
      if (!fs.existsSync(dir)) {
        throw new Error(`Directory not found: ${dir}`);
      }
      const items = parsed.recursive
        ? listFilesRecursive(dir, [".pkt", ".pka"], 500)
        : fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && [".pkt", ".pka"].includes(path.extname(entry.name).toLowerCase()))
            .map((entry) => {
              const fullPath = path.join(dir, entry.name);
              const stat = fs.statSync(fullPath);
              return { path: fullPath, size: stat.size, mtime: stat.mtime.toISOString() };
            });
      return textResult(JSON.stringify({ dir, recursive: parsed.recursive, items }, null, 2));
    }

    case "packettracer_prepare_workspace": {
      const parsed = prepareWorkspaceSchema.parse(args);
      const safeName = parsed.name.replace(/[\\/:*?"<>|]/g, "_").trim();
      if (!safeName) {
        throw new Error("Workspace name became empty after sanitization");
      }
      const projectDir = ensureWithinWorkspace(path.join(WORKSPACE, safeName));
      fs.mkdirSync(projectDir, { recursive: true });
      return textResult(`Prepared Packet Tracer workspace folder: ${projectDir}`);
    }

    case "packettracer_list_bin": {
      if (!fs.existsSync(BIN_DIR)) {
        throw new Error(`Bin directory not found: ${BIN_DIR}`);
      }
      const items = fs.readdirSync(BIN_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((entry) => /\.(exe|dll|conf)$/i.test(entry))
        .slice(0, 200);
      return textResult(JSON.stringify({ binDir: BIN_DIR, items }, null, 2));
    }

    default:
      throw new Error(`Unhandled tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
