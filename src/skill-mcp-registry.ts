export type RuntimeMcpConfig = {
  type: "local" | "remote"
  command?: string[]
  url?: string
  headers?: Record<string, string>
  environment?: Record<string, string>
  timeout?: number
}

export type SkillMcpBinding = {
  skillName: string
  serverName: string
  config: RuntimeMcpConfig
  disconnectWhenIdle: boolean
}

const CONTEXT7_REMOTE: RuntimeMcpConfig = {
  type: "remote",
  url: "https://mcp.context7.com/mcp",
}

const GITHUB_READONLY_REMOTE: RuntimeMcpConfig = {
  type: "remote",
  url: "https://api.githubcopilot.com/mcp/",
  headers: {
    "X-MCP-Readonly": "true",
    "Authorization": "Bearer {env:GITHUB_PAT}",
  },
}

const SECKB_LOCAL: RuntimeMcpConfig = {
  type: "local",
  command: [
    "{env:SECKB_PYTHON}",
    "{env:SECKB_MCP_SERVER}",
  ],
  environment: {
    "SECKB_ROOT": "{env:SECKB_ROOT}",
    "SECKB_CONFIG": "{env:SECKB_CONFIG}",
    "PYTHONUTF8": "1",
    "PYTHONIOENCODING": "utf-8",
  },
  timeout: 60000,
}

const CVEKB_LOCAL: RuntimeMcpConfig = {
  type: "local",
  command: [
    "{env:SECKB_PYTHON}",
    "{env:CVEKB_MCP_SERVER}",
  ],
  environment: {
    "CVEKB_ROOT": "{env:CVEKB_ROOT}",
    "PYTHONUTF8": "1",
    "PYTHONIOENCODING": "utf-8",
  },
  timeout: 60000,
}

const ANYSEARCH_REMOTE: RuntimeMcpConfig = {
  type: "remote",
  url: "https://api.anysearch.com/mcp",
  headers: {
    "Authorization": "Bearer {env:ANYSEARCH_API_KEY}",
  },
  timeout: 60000,
}

// CTF-focused dynamic MCP registry. These bindings are intentionally narrow:
// fast agents stay clean, while rigorous/specialist skills can lease heavier
// knowledge or source-intelligence MCPs only when the matching skill is loaded.
export const SKILL_MCP_BINDINGS: SkillMcpBinding[] = [
  {
    skillName: "ctf-web-java",
    serverName: "runtime_context7_java",
    config: CONTEXT7_REMOTE,
    disconnectWhenIdle: true,
  },
  {
    skillName: "ctf-whitebox-audit",
    serverName: "runtime_github_readonly",
    config: GITHUB_READONLY_REMOTE,
    disconnectWhenIdle: true,
  },
  {
    skillName: "ctf-whitebox-audit",
    serverName: "runtime_seckb_local",
    config: SECKB_LOCAL,
    disconnectWhenIdle: true,
  },
  {
    skillName: "ctf-seckb",
    serverName: "runtime_seckb_local",
    config: SECKB_LOCAL,
    disconnectWhenIdle: true,
  },
  {
    skillName: "ctf-seckb",
    serverName: "runtime_cvekb_local",
    config: CVEKB_LOCAL,
    disconnectWhenIdle: true,
  },
  {
    skillName: "anysearch",
    serverName: "runtime_anysearch_remote",
    config: ANYSEARCH_REMOTE,
    disconnectWhenIdle: true,
  },
]

export function bindingsForSkill(skillName: string) {
  return SKILL_MCP_BINDINGS.filter((binding) => binding.skillName === skillName)
}

export function bindingForSkillServer(skillName: string, serverName: string) {
  return SKILL_MCP_BINDINGS.find((binding) => binding.skillName === skillName && binding.serverName === serverName)
}
