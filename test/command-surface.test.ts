import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { COMMAND_SURFACE } from "../packages/ctf-core/src/router.js"

const root = process.cwd()

const publicCommandFiles = [
  "ctf.md",
  "help.md",
  "ctf-fast.md",
  "ctf-expert.md",
  "resume.md",
]

function isHiddenCommand(file: string) {
  return /^hidden:\s*["']?true["']?\s*$/m.test(readFileSync(join(root, "commands", file), "utf8"))
}

function commandToFile(command: string) {
  return `${command.replace(/^\//, "")}.md`
}

describe("public command surface", () => {
  it("manifest default entrypoints resolve to installed command files", () => {
    const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
      default_entrypoints: string[]
    }
    for (const command of manifest.default_entrypoints) {
      expect(existsSync(join(root, "commands", commandToFile(command))), command).toBe(true)
    }
  })

  it("commands directory contains only the intended public slash surface", () => {
    const files = readdirSync(join(root, "commands"))
      .filter((name) => name.endsWith(".md"))
      .filter((name) => !isHiddenCommand(name))
      .sort()
    expect(files).toEqual([...publicCommandFiles].sort())
  })

  it("keeps specialist slash commands bundled but hidden from the public surface", () => {
    for (const file of ["ctf-web.md", "ctf-pwn.md", "ctf-rev.md", "ctf-crypto.md", "ctf-forensics.md", "ctf-misc.md"]) {
      expect(isHiddenCommand(file), file).toBe(true)
    }
  })

  it("docs do not advertise retired slash-command entrypoints", () => {
    for (const file of ["README.md", "commands/ctf.md", "commands/help.md"]) {
      const document = readFileSync(join(root, file), "utf8")
      expect(document).not.toContain("/ctf-help")
      expect(document).not.toContain("/ctf-web|pwn|rev|crypto|forensics|misc")
    }
  })

  it("router L0/L1 surface matches installed command files", () => {
    const manifest = JSON.parse(readFileSync(join(root, "ctf-agent.manifest.json"), "utf8")) as {
      default_entrypoints: string[]
    }
    const routerCommands = [...COMMAND_SURFACE.L0, ...COMMAND_SURFACE.L1].map((entry) => entry.command)
    expect(routerCommands.slice(0, manifest.default_entrypoints.length)).toEqual(manifest.default_entrypoints)
    expect(routerCommands.map(commandToFile).sort()).toEqual([...publicCommandFiles].sort())
  })
})
