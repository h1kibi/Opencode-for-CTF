import { spawn } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)))
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
const checker = join(projectRoot, "scripts", "check-web-benchmarks.ts")

function runChecker(env?: Record<string, string>): Promise<{ code: number | null; output: string }> {
  const emptyDir = mkdtempSync(join(tmpdir(), "ctf-bench-empty-"))
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, checker, emptyDir], {
      env: { ...process.env, ...env },
    })
    let output = ""
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, output }))
  })
}

describe("benchmark checker empty-output policy (no silent success)", () => {
  it("fails with exit 1 when a benchmark directory has no solver output", async () => {
    const { code, output } = await runChecker()
    expect(code).toBe(1)
    expect(output).toContain("FAIL")
    expect(output).toContain("empty benchmark directory must not count as success")
  }, 60_000)

  it("explicitly SKIPs only with CTF_BENCH_ALLOW_EMPTY=1", async () => {
    const { code, output } = await runChecker({ CTF_BENCH_ALLOW_EMPTY: "1" })
    expect(code).toBe(0)
    expect(output).toContain("SKIP")
    expect(output).toContain("NOT success")
  }, 60_000)
})
