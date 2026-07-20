/**
 * MCP Server Registry — single source of truth for all known CTF MCP servers.
 *
 * Each entry defines the server's identity, weight category, applicable challenge
 * domains, runtime config, and environment prerequisites.
 *
 * This registry decouples MCP definitions from both the static opencode.jsonc
 * config and the runtime skill-mcp bindings. It drives:
 *   - agent-mcp-profiles.ts → which servers each agent gets by default
 *   - dynamic-mcp-manager.ts → on-demand request/approve lifecycle
 */

import type { McpServerMeta } from "./types.ts"

/**
 * Complete registry of all MCP servers available to CTF agents.
 *
 * Weight tiers:
 *   light  — always-on baseline, every CTF subagent gets these
 *   medium — domain-specific tools, activated per-agent profile
 *   heavy  — resource-intensive or rarely needed, must request
 */
export const MCP_SERVER_REGISTRY: McpServerMeta[] = [
  // ====================================================================
  // LIGHT — Common baseline (filesystem, knowledge, search)
  // ====================================================================
  {
    id: "filesystem",
    description: "Local filesystem read/write — browse, read, write challenge files and artifacts.",
    weight: "light",
    group: "recon",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: [
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        // workspace root is injected at activation time
      ],
    },
  },
  {
    id: "context7",
    description: "Context7 knowledge search — external CTI/knowledge retrieval MCP.",
    weight: "light",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "remote",
      url: "https://mcp.context7.com/mcp",
    },
  },
  {
    id: "github",
    description: "GitHub read-only access — search code, read repos, lookup issues/PRs.",
    weight: "light",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "remote",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        Authorization: "Bearer {env:GITHUB_PAT}",
        "X-MCP-Readonly": "true",
      },
    },
    envRequired: ["GITHUB_PAT"],
  },
  {
    id: "markitdown",
    description: "Document-to-Markdown conversion — read PDFs, Office docs, images as text.",
    weight: "light",
    group: "recon",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: ["npx", "-y", "mcp-markdownify-server"],
    },
  },

  // ====================================================================
  // MEDIUM — Domain-specific tools enabled per-agent profile
  // ====================================================================
  {
    id: "browser",
    description: "Playwright browser automation — inspect live web apps, click, fill forms, trace stateful flows.",
    weight: "medium",
    group: "recon",
    categories: ["web", "forensics"],
    config: {
      type: "local",
      command: ["npx", "-y", "@playwright/mcp@latest"],
    },
  },
  {
    id: "ReVa",
    description: "Ghidra headless reverse engineering — decompile, cross-reference, data-flow analysis.",
    weight: "medium",
    group: "analysis",
    categories: ["rev", "pwn"],
    config: {
      type: "local",
      command: ["mcp-reva"],
      environment: { GHIDRA_INSTALL_DIR: "{env:GHIDRA_INSTALL_DIR}" },
    },
    envRequired: ["GHIDRA_INSTALL_DIR"],
  },
  {
    id: "wireshark-mcp",
    description: "WireMCP-backed Wireshark/tshark packet analysis — pcap parsing, protocol dissection, stream follow.",
    weight: "medium",
    group: "analysis",
    categories: ["forensics", "misc"],
    config: {
      type: "local",
      command: ["python", "{env:WIREMCP_LAUNCHER}", "--stdio"],
    },
    envRequired: ["WIREMCP_LAUNCHER"],
  },
  {
    id: "cyberchef-mcp",
    description: "CyberChef workflow automation — structured transforms for encodings, crypto helpers, and artifact triage.",
    weight: "medium",
    group: "analysis",
    categories: ["crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: ["npx", "-y", "cyberchef-mcp"],
    },
  },
  {
    id: "seckb",
    description: "Local security knowledge base — curated CTF technique database.",
    weight: "medium",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: ["{env:SECKB_PYTHON}", "{env:SECKB_MCP_SERVER}"],
      environment: {
        SECKB_ROOT: "{env:SECKB_ROOT}",
        SECKB_CONFIG: "{env:SECKB_CONFIG}",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    },
    envRequired: ["SECKB_PYTHON", "SECKB_MCP_SERVER", "SECKB_ROOT"],
  },

  // ====================================================================
  // HEAVY — Resource-intensive or niche tools (request required)
  // ====================================================================
  {
    id: "ida-pro",
    description: "IDA Pro / mrexodia ida-pro-mcp backend — advanced static analysis, decompilation, script execution.",
    weight: "heavy",
    group: "analysis",
    categories: ["rev", "pwn"],
    config: {
      type: "local",
      command: ["ida-pro-mcp", "--stdio"],
    },
  },
  {
    id: "flutter-aot",
    description: "Flutter AOT decompilation — recover Dart source from AOT-compiled blobs.",
    weight: "heavy",
    group: "analysis",
    categories: ["rev", "misc"],
    config: {
      type: "local",
      command: ["python", "{env:FLUTTER_AOT_MCP_SERVER}", "--stdio"],
    },
    envRequired: ["FLUTTER_AOT_MCP_SERVER"],
    timeout: 3_600_000,
  },
  {
    id: "cvekb",
    description: "Local CVE knowledge base — query CVE entries and exploit intelligence.",
    weight: "heavy",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: ["{env:SECKB_PYTHON}", "{env:CVEKB_MCP_SERVER}"],
      environment: {
        CVEKB_ROOT: "{env:CVEKB_ROOT}",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    },
    envRequired: ["SECKB_PYTHON", "CVEKB_MCP_SERVER", "CVEKB_ROOT"],
  },
  {
    id: "ctfd-mcp",
    description: "CTFd integration — challenge metadata and event workflow helper, kept disabled unless explicitly configured.",
    weight: "heavy",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "local",
      command: ["npx", "-y", "ctfd-mcp"],
    },
  },
  {
    id: "anysearch",
    description: "AnySearch web search API — external search for vulnerability research and writeups.",
    weight: "heavy",
    group: "knowledge",
    categories: ["web", "pwn", "rev", "crypto", "forensics", "misc"],
    config: {
      type: "remote",
      url: "https://api.anysearch.com/mcp",
      headers: { Authorization: "Bearer {env:ANYSEARCH_API_KEY}" },
    },
    envRequired: ["ANYSEARCH_API_KEY"],
  },
]

/** Look up a server definition by its ID. */
export function lookupMcpServer(id: string): McpServerMeta | undefined {
  return MCP_SERVER_REGISTRY.find((s) => s.id === id)
}

/** Filter servers by weight level. */
export function serversByWeight(weight: "light" | "medium" | "heavy"): McpServerMeta[] {
  return MCP_SERVER_REGISTRY.filter((s) => s.weight === weight)
}

/** Check whether an environment prerequisite is satisfied. */
export function envPrerequisitesSatisfied(server: McpServerMeta): { ok: boolean; missing: string[] } {
  if (!server.envRequired?.length) return { ok: true, missing: [] }
  const missing = server.envRequired.filter((env) => !process.env[env])
  return { ok: missing.length === 0, missing }
}
