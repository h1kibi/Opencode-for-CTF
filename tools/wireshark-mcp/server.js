import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const WIRESHARK_DIR = process.env.WIRESHARK_DIR || "C:\\Program Files\\Wireshark";
const WIRESHARK_EXE = process.env.WIRESHARK_EXE || path.join(WIRESHARK_DIR, "Wireshark.exe");
const TSHARK_EXE = process.env.TSHARK_EXE || path.join(WIRESHARK_DIR, "tshark.exe");
const CAPINFOS_EXE = process.env.CAPINFOS_EXE || path.join(WIRESHARK_DIR, "capinfos.exe");
const WORKSPACE = process.env.WIRESHARK_WORKSPACE || "C:\\Users\\Administrator\\Desktop\\PacketTracerLabs";

const TOOL_NAMES = [
  "wireshark_status",
  "wireshark_list_interfaces",
  "wireshark_capinfos",
  "wireshark_tshark_summary",
  "wireshark_tshark_follow",
  "wireshark_open_capture",
];

const capFileSchema = z.object({ file: z.string() });
const summarySchema = z.object({
  file: z.string(),
  displayFilter: z.string().optional().default(""),
  limit: z.number().int().min(1).max(500).optional().default(50),
  fields: z.array(z.string()).optional().default(["frame.number", "frame.time", "ip.src", "ip.dst", "_ws.col.Protocol", "_ws.col.Info"]),
});
const followSchema = z.object({
  file: z.string(),
  streamType: z.enum(["tcp", "udp", "http", "http2", "quic"]).optional().default("tcp"),
  streamIndex: z.number().int().min(0).optional().default(0),
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

function ensureCaptureFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".pcap", ".pcapng", ".cap"].includes(ext)) {
    throw new Error("Only .pcap, .pcapng, and .cap files are supported");
  }
}

function runCommand(exe, args, timeout = 30000) {
  const result = spawnSync(exe, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024 * 8,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Command failed with status ${result.status}`).trim());
  }
  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    status: result.status,
  };
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
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

function parseInterfaces(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\.\s+(.*)$/);
      if (!m) return { raw: line };
      return { index: Number(m[1]), text: m[2] };
    });
}

const server = new Server({ name: "wireshark-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "wireshark_status",
      description: "Check Wireshark, tshark, and workspace status.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wireshark_list_interfaces",
      description: "List tshark capture interfaces.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wireshark_capinfos",
      description: "Run capinfos against a workspace capture file.",
      inputSchema: {
        type: "object",
        required: ["file"],
        properties: { file: { type: "string" } },
      },
    },
    {
      name: "wireshark_tshark_summary",
      description: "Summarize packets from a capture file using tshark fields output.",
      inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
          file: { type: "string" },
          displayFilter: { type: "string" },
          limit: { type: "number" },
          fields: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "wireshark_tshark_follow",
      description: "Follow a TCP/UDP/HTTP stream in a capture file.",
      inputSchema: {
        type: "object",
        required: ["file"],
        properties: {
          file: { type: "string" },
          streamType: { type: "string" },
          streamIndex: { type: "number" },
        },
      },
    },
    {
      name: "wireshark_open_capture",
      description: "Open a workspace capture file in the Wireshark GUI.",
      inputSchema: {
        type: "object",
        required: ["file"],
        properties: { file: { type: "string" } },
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
    case "wireshark_status": {
      const result = {
        wiresharkDir: WIRESHARK_DIR,
        wiresharkExists: fs.existsSync(WIRESHARK_EXE),
        tsharkExists: fs.existsSync(TSHARK_EXE),
        capinfosExists: fs.existsSync(CAPINFOS_EXE),
        workspace: WORKSPACE,
        workspaceExists: fs.existsSync(WORKSPACE),
      };
      return textResult(JSON.stringify(result, null, 2));
    }

    case "wireshark_list_interfaces": {
      const out = runCommand(TSHARK_EXE, ["-D"], 30000);
      return textResult(JSON.stringify({ interfaces: parseInterfaces(out.stdout) }, null, 2));
    }

    case "wireshark_capinfos": {
      const parsed = capFileSchema.parse(args);
      const file = ensureWithinWorkspace(parsed.file);
      ensureCaptureFile(file);
      if (!fs.existsSync(file)) throw new Error(`Capture file not found: ${file}`);
      const out = runCommand(CAPINFOS_EXE, [file], 30000);
      return textResult(out.stdout);
    }

    case "wireshark_tshark_summary": {
      const parsed = summarySchema.parse(args);
      const file = ensureWithinWorkspace(parsed.file);
      ensureCaptureFile(file);
      if (!fs.existsSync(file)) throw new Error(`Capture file not found: ${file}`);
      const argsList = ["-r", file];
      if (parsed.displayFilter) argsList.push("-Y", parsed.displayFilter);
      argsList.push("-T", "fields", "-E", "header=y", "-E", "separator=\\t");
      for (const field of parsed.fields) {
        argsList.push("-e", field);
      }
      argsList.push("-c", String(parsed.limit));
      const out = runCommand(TSHARK_EXE, argsList, 45000);
      return textResult(out.stdout || "(no matching packets)");
    }

    case "wireshark_tshark_follow": {
      const parsed = followSchema.parse(args);
      const file = ensureWithinWorkspace(parsed.file);
      ensureCaptureFile(file);
      if (!fs.existsSync(file)) throw new Error(`Capture file not found: ${file}`);
      const out = runCommand(TSHARK_EXE, ["-r", file, "-z", `follow,${parsed.streamType},ascii,${parsed.streamIndex}`, "-q"], 45000);
      return textResult(out.stdout || "(no stream output)");
    }

    case "wireshark_open_capture": {
      const parsed = capFileSchema.parse(args);
      const file = ensureWithinWorkspace(parsed.file);
      ensureCaptureFile(file);
      if (!fs.existsSync(file)) throw new Error(`Capture file not found: ${file}`);
      const pid = spawnDetached(WIRESHARK_EXE, [file], path.dirname(file));
      return textResult(`Opened ${file} in Wireshark (PID ${pid})`);
    }

    default:
      throw new Error(`Unhandled tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
