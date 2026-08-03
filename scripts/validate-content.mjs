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

const SKILL_CONTRACT_FIELDS = [
  "Load When",
  "Do Not Load When",
  "Required Inputs",
  "First Safe Action",
  "Dispatch / Handoff",
  "Output Contract",
  "Stop Conditions",
]

const CONTROL_SKILLS = [
  "ctf-common",
  "ctf-router",
  "ctf-lead",
  "ctf-decision-engine",
  "ctf-experience-gate",
  "ctf-ledger-discipline",
  "ctf-closure-gate",
]

const ORCHESTRATOR_SKILLS = ["ctf-web", "ctf-pwn", "ctf-rev", "ctf-crypto", "ctf-forensics", "ctf-misc", "ctf-aisec"]
const FOCUSED_SKILL_FIELDS = SKILL_CONTRACT_FIELDS

function hasHeading(body, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^##\\s+${escapedHeading}\\s*$`, "m").test(body)
}

async function validateSkillContracts() {
  const contractFile = path.join(ROOT, "skills", "SKILL_CONTRACT.md")
  try {
    if (!(await stat(contractFile)).isFile()) throw new Error("not a file")
  } catch {
    errors.push("skills/SKILL_CONTRACT.md: missing shared skill contract")
  }

  const bundledSkillNames = new Set(
    (await readdir(path.join(ROOT, "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

  for (const skillName of [...CONTROL_SKILLS, ...ORCHESTRATOR_SKILLS]) {
    const skillFile = path.join(ROOT, "skills", skillName, "SKILL.md")
    let body
    try {
      body = await readFile(skillFile, "utf8")
    } catch {
      continue
    }
    for (const field of SKILL_CONTRACT_FIELDS) {
      if (!hasHeading(body, field)) errors.push(`${path.relative(ROOT, skillFile)}: missing contract heading '## ${field}'`)
    }
  }

  const normalizedFocusedSkills = [...bundledSkillNames].filter(
    (name) => name.startsWith("ctf-web-") || name.startsWith("ctf-forensics-"),
  )
  const webFocusedSkills = normalizedFocusedSkills.filter((name) => name.startsWith("ctf-web-"))
  const forensicsFocusedSkills = normalizedFocusedSkills.filter((name) => name.startsWith("ctf-forensics-"))
  const webRouterPath = path.join(ROOT, "skills", "ctf-web", "SKILL.md")
  const webRouter = await readFile(webRouterPath, "utf8")
  for (const skillName of normalizedFocusedSkills) {
    const skillFile = path.join(ROOT, "skills", skillName, "SKILL.md")
    const body = await readFile(skillFile, "utf8")
    for (const field of FOCUSED_SKILL_FIELDS) {
      if (!hasHeading(body, field)) errors.push(`${path.relative(ROOT, skillFile)}: missing focused contract heading '## ${field}'`)
    }
    if (webFocusedSkills.includes(skillName) && !webRouter.includes(`\`${skillName}\``)) {
      errors.push(`skills/ctf-web/SKILL.md: focused skill ${skillName} is not in the dispatch table`)
    }
  }

  const forensicsRouter = await readFile(path.join(ROOT, "skills", "ctf-forensics", "SKILL.md"), "utf8")
  for (const skillName of forensicsFocusedSkills) {
    if (!forensicsRouter.includes(`\`${skillName}\``)) {
      errors.push(`skills/ctf-forensics/SKILL.md: focused skill ${skillName} is not in the dispatch table`)
    }
  }

  const loadEdges = new Map()
  for (const skillName of bundledSkillNames) {
    const skillFile = path.join(ROOT, "skills", skillName, "SKILL.md")
    const body = await readFile(skillFile, "utf8")
    const edges = [...body.matchAll(/\b[Ll]oad\s+`(ctf-[a-z0-9-]+)`/g)]
      .map((match) => match[1])
      .filter((target) => bundledSkillNames.has(target))
    loadEdges.set(skillName, new Set(edges))
  }

  const visitState = new Map()
  const activePath = []
  function visit(skillName) {
    visitState.set(skillName, "active")
    activePath.push(skillName)
    for (const target of loadEdges.get(skillName) ?? []) {
      const targetState = visitState.get(target)
      if (targetState === "active") {
        const start = activePath.indexOf(target)
        errors.push(`skills: cyclic Load dispatch ${[...activePath.slice(start), target].join(" -> ")}`)
      } else if (!targetState) {
        visit(target)
      }
    }
    activePath.pop()
    visitState.set(skillName, "done")
  }
  for (const skillName of bundledSkillNames) {
    if (!visitState.has(skillName)) visit(skillName)
  }
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
await validateSkillContracts()

for (const warning of warnings) console.warn(`warning: ${warning}`)
if (errors.length) {
  console.error(`frontmatter/content validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `frontmatter/content validation passed: ${commandCount} commands, ${agentCount} agents, ${skillCount} skills`,
)
