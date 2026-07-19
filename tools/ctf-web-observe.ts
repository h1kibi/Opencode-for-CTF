import { tool } from "@opencode-ai/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { caseDirectory } from "../src/case-state.ts"

export default tool({
  description: "Observe an authorized CTF web page and save a structured request/response artifact.",
  args: {
    url: tool.schema.string().url(),
    caseId: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const url = new URL(args.url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    let response: Response
    try {
      response = await fetch(url, { redirect: "manual", signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    const body = await response.text()
    const headers = Object.fromEntries(response.headers.entries())
    const links = Array.from(body.matchAll(/href=["']([^"']+)/gi), (match) => match[1]).slice(0, 100)
    const artifact = {
      url: url.toString(),
      status: response.status,
      headers,
      redirect: response.headers.get("location"),
      title: body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
      links,
      bodyPreview: body.slice(0, 4_000),
      capturedAt: new Date().toISOString(),
    }
    if (args.caseId) {
      const directory = path.join(caseDirectory(context.directory, args.caseId), "artifacts", "web")
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, `observe-${Date.now()}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
    }
    return JSON.stringify(artifact, null, 2)
  },
})
