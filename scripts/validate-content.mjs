#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const ROOT = path.resolve(import.meta.dirname, "..")
const errors = []
const warnings = []

function parseFrontmatter(raw, file) {
  // UTF-8 BOM is tolerated but normalized away.
  raw = raw.replace(/^﻿/, "")
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    errors.push(`${file}: missing opening YAML frontmatter delimiter`)
    return null
  }
  const normalized = raw.replace(/\r\n/g, "\n")
  const end = normalized.indexOf("\n---\n", 4)
  if (end < 0) {
    errors.push(`${file}: missing closing YAML frontmatter delimiter`)
    return null
  }
  const block = normalized.slice(4, end)
  const fields = new Map()
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*:\s*(.*)$/)
    if (match) fields.set(match[1], match[2].trim())
  }
  return fields
}

async function filesIn(dir, suffix = ".md") {
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(dir, entry.name))
    .sort()
}

async function validateCommands() {
  const commandDir = path.join(ROOT, "commands")
  const files = await filesIn(commandDir)
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const fields = parseFrontmatter(await readFile(file, "utf8"), rel)
    if (!fields) continue
    if (!fields.has("description")) errors.push(`${rel}: missing required frontmatter field 'description'`)
    if (!fields.has("agent")) warnings.push(`${rel}: no 'agent' field; command will use the active/default agent`)
    if (!fields.has("subtask")) warnings.push(`${rel}: no 'subtask' field; OpenCode default behavior applies`)
  }
  return files.length
}

async function validateAgents() {
  const agentDir = path.join(ROOT, "agents")
  const files = await filesIn(agentDir)
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const fields = parseFrontmatter(await readFile(file, "utf8"), rel)
    if (!fields) continue
    if (!fields.has("description")) errors.push(`${rel}: missing required frontmatter field 'description'`)
    if (!fields.has("mode")) errors.push(`${rel}: missing required frontmatter field 'mode'`)
  }
  return files.length
}

async function validateSkills() {
  const skillsDir = path.join(ROOT, "skills")
  const entries = await readdir(skillsDir, { withFileTypes: true })
  let count = 0
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const skillFile = path.join(skillsDir, entry.name, "SKILL.md")
    try {
      if (!(await stat(skillFile)).isFile()) throw new Error("not a file")
      const raw = await readFile(skillFile, "utf8")
      if (!raw.trim()) errors.push(`${path.relative(ROOT, skillFile)}: empty SKILL.md`)
      count++
    } catch {
      errors.push(`skills/${entry.name}: missing SKILL.md`)
    }
  }
  return count
}

const commandCount = await validateCommands()
const agentCount = await validateAgents()
const skillCount = await validateSkills()

for (const warning of warnings) console.warn(`warning: ${warning}`)
if (errors.length) {
  console.error(`frontmatter/content validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `frontmatter/content validation passed: ${commandCount} commands, ${agentCount} agents, ${skillCount} skills`,
)
