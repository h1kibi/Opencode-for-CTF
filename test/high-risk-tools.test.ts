import { describe, expect, it } from "vitest"
import { makeTestWorkspaceAsync } from "./support/test-workspace.ts"
import backgroundJob from "../tools/core/ctf-background-job.js"

type Context = { directory: string }
type ToolResult = string | { output?: string }

function outputOf(result: ToolResult): string {
  return typeof result === "string" ? result : result.output || ""
}

async function waitForOutput(fn: () => Promise<string>, pattern: string, attempts = 15): Promise<string> {
  let last = ""
  for (let i = 0; i < attempts; i++) {
    last = await fn()
    if (last.includes(pattern)) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return last
}

describe("high-risk tool contracts", () => {
  it("ctf-background-job starts, reports, reads, and stops a workspace-local node job", async () => {
    const dir = await makeTestWorkspaceAsync("ctf-background-job")
    const context = { directory: dir } as Context
    let started: Record<string, unknown> | null = null

    try {
      const parsedStart = JSON.parse(
        outputOf(
          await backgroundJob.execute(
            {
              operation: "start",
              id: "contract",
              lang: "node",
              code: "console.log('BG_CONTRACT_OK'); setTimeout(() => {}, 10000)",
              jsonOnly: true,
            },
            context as never,
          ),
        ),
      )
      started = parsedStart

      expect(parsedStart.ok).toBe(true)
      expect(parsedStart.pid).toBeGreaterThan(0)

      const status = JSON.parse(
        outputOf(
          await backgroundJob.execute({ operation: "status", id: "contract", jsonOnly: true }, context as never),
        ),
      )
      expect(status.ok).toBe(true)
      expect(status.running).toBe(true)

      const jobOutput = await waitForOutput(async () => {
        const read = JSON.parse(
          outputOf(
            await backgroundJob.execute({ operation: "read", id: "contract", jsonOnly: true }, context as never),
          ),
        )
        return `${read.stdout}\n${read.stderr}`
      }, "BG_CONTRACT_OK")
      expect(jobOutput).toContain("BG_CONTRACT_OK")

      const stopped = JSON.parse(
        outputOf(await backgroundJob.execute({ operation: "stop", id: "contract", jsonOnly: true }, context as never)),
      )
      expect(stopped.stopped).toBe(true)
    } finally {
      if (started) {
        await backgroundJob
          .execute({ operation: "stop", id: "contract", jsonOnly: true }, context as never)
          .catch(() => undefined)
      }
    }
  }, 60000)
})
