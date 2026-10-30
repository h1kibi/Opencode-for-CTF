import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"

const TOOL_ROOT = path.resolve(process.cwd(), "tools")

type ToolDefinition = {
  description?: unknown
  args?: Record<string, { safeParse?: unknown }>
  execute?: unknown
}

async function discoverToolFiles(dir: string, base = dir): Promise<Array<{ name: string; file: string }>> {
  const found: Array<{ name: string; file: string }> = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "lib") continue
      found.push(...(await discoverToolFiles(path.join(dir, entry.name), base)))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue
    found.push({ name: entry.name.slice(0, -3), file: path.join(dir, entry.name) })
  }
  return found.sort((left, right) => left.name.localeCompare(right.name))
}

describe("registered tool surface", () => {
  it("exports a loadable definition for every tool shipped on disk", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "ctf-agent.manifest.json"), "utf8")) as {
      registered_tools: string[]
    }
    const files = await discoverToolFiles(TOOL_ROOT)
    const onDisk = files.map((entry) => entry.name)

    expect(onDisk).toEqual([...manifest.registered_tools].sort())

    const invalid: string[] = []
    for (const entry of files) {
      const module = (await import(pathToFileURL(entry.file).href)) as { default?: ToolDefinition }
      const definition = module.default
      if (!definition || typeof definition.execute !== "function") {
        invalid.push(`${entry.name}: missing execute`)
        continue
      }
      if (typeof definition.description !== "string" || definition.description.trim().length === 0) {
        invalid.push(`${entry.name}: empty description`)
      }
      for (const [argName, schema] of Object.entries(definition.args ?? {})) {
        if (typeof schema?.safeParse !== "function") invalid.push(`${entry.name}: arg ${argName} is not a schema`)
      }
    }

    expect(invalid).toEqual([])
  })
})
