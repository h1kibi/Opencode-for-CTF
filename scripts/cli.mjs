#!/usr/bin/env node

const command = process.argv[2] ?? "help"

const HELP = `opencode-for-ctf — CTF agent plugin for OpenCode

Usage:
  opencode-for-ctf <command> [options]

Commands:
  install [--profile safe|web|full]   Install agents/commands/skills/plugin into OpenCode
  upgrade  [--profile ...]            Upgrade managed files (keeps user edits)
  status   [--strict]                 Show install health and write opencode-for-ctf.plugin-health.json
  uninstall                           Remove managed install
  doctor [--tooling] [--json]         Install doctor; --tooling checks the challenge toolchain
  help                                Show this help

Profiles:
  full   Adds disabled MCP stubs for all supported CTF integrations (default)
  safe   No MCP definitions
  web    Adds disabled browser/markitdown/context7 MCP stubs

Environment:
  OPENCODE_CONFIG_DIR                 Override OpenCode config directory
  OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1
                                      Copy external SecKnowledge reference skill snapshot (large)
  OPENCODE_CTF_TOOL_PACKS             e.g. all  or  core,web,pwn
  OPENCODE_CTF_FORCE_BUILD=0          Skip rebuild when dist/ already exists

Examples:
  npx opencode-for-ctf install
  npx opencode-for-ctf install --profile safe
  npm run ctf:install
  opencode-for-ctf status --strict

After install, restart OpenCode and run:
  /ctf ./challenge
  /help
`

if (command === "help" || command === "--help" || command === "-h") {
  console.log(HELP)
} else if (command === "install") await import("./install.mjs")
else if (command === "upgrade") await import("./upgrade.mjs")
else if (command === "status") await import("./status.mjs")
else if (command === "uninstall") await import("./uninstall.mjs")
else if (command === "doctor") {
  if (process.argv.includes("--tooling")) await import("./doctor.mjs")
  else await import("./doctor-install.mjs")
} else {
  console.error(`Unknown command: ${command}\n`)
  console.error(HELP)
  process.exitCode = 1
}
