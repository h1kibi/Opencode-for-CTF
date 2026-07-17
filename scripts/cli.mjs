#!/usr/bin/env node

const command = process.argv[2] ?? "help"

const HELP = `opencode-for-ctf — CTF agent plugin for OpenCode

Usage:
  opencode-for-ctf <command> [options]

Commands:
  install [--profile safe|web|full]   Install agents/commands/skills/plugin into OpenCode
  upgrade  [--profile ...]            Upgrade managed files (keeps user edits)
  status   [--strict]                 Show install health
  uninstall                           Remove managed install
  doctor                              Run install doctor
  help                                Show this help

Profiles:
  safe   No MCP definitions (default)
  web    Adds disabled browser/markitdown/context7 MCP stubs
  full   Adds more disabled MCP stubs (github, ReVa, seckb, cvekb)

Environment:
  OPENCODE_CONFIG_DIR                 Override OpenCode config directory
  OPENCODE_CTF_INCLUDE_EXTERNAL_SKILLS=1
                                      Copy external ctf-skills snapshot (large)
  OPENCODE_CTF_TOOL_PACKS             e.g. all  or  core,web,pwn
  OPENCODE_CTF_FORCE_BUILD=0          Skip rebuild when dist/ already exists

Examples:
  npx opencode-for-ctf install
  npx opencode-for-ctf install --profile web
  npm run ctf:install
  opencode-for-ctf status --strict

After install, restart OpenCode and run:
  /ctf ./challenge
  /ctf-help
`

if (command === "help" || command === "--help" || command === "-h") {
  console.log(HELP)
} else if (command === "install") await import("./install.mjs")
else if (command === "upgrade") await import("./upgrade.mjs")
else if (command === "status") await import("./status.mjs")
else if (command === "uninstall") await import("./uninstall.mjs")
else if (command === "doctor") await import("./doctor-install.mjs")
else {
  console.error(`Unknown command: ${command}\n`)
  console.error(HELP)
  process.exitCode = 1
}
