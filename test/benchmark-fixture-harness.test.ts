import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)))
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs")
const checker = join(projectRoot, "scripts", "check-web-benchmarks.ts")

function runChecker(targetDir: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, checker, targetDir], {
      env: process.env,
    })
    let output = ""
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, output }))
  })
}

function writeFixture(
  root: string,
  options: { expectedFlag: string; producedFlag: string; replayRequired?: boolean; createReplayMarker?: boolean },
) {
  const resultDir = join(root, "result")
  mkdirSync(resultDir, { recursive: true })
  writeFileSync(
    join(root, "challenge.yaml"),
    [
      "id: web-fixture-smoke",
      "family: web",
      "oracle:",
      `  expected_flag: '${options.expectedFlag}'`,
      "  flag_pattern: '^flag\\{[^}]+\\}$'",
      "solver:",
      "  candidate_files:",
      "    - result/flag.txt",
      "verification:",
      `  replay_required: ${options.replayRequired ? "true" : "false"}`,
      "  replay_marker: result/replay.ok",
      "",
    ].join("\n"),
    "utf8",
  )
  writeFileSync(join(resultDir, "flag.txt"), `${options.producedFlag}\n`, "utf8")
  if (options.createReplayMarker) writeFileSync(join(resultDir, "replay.ok"), "ok\n", "utf8")
}

describe("benchmark fixture harness", () => {
  it("passes a fixture only when oracle verification and replay marker both succeed", async () => {
    const root = mkdtempSync(join(tmpdir(), "ctf-bench-fixture-pass-"))
    writeFixture(root, {
      expectedFlag: "flag{fixture_pass}",
      producedFlag: "flag{fixture_pass}",
      replayRequired: true,
      createReplayMarker: true,
    })

    const { code, output } = await runChecker(root)
    expect(code).toBe(0)
    expect(output).toContain("Fixture Results")
    expect(output).toContain("| web-fixture-smoke | web | PASS |")
    expect(output).toContain("oracle-verified")
    expect(output).toContain("replay marker present")
  }, 60_000)

  it("fails when a produced candidate does not satisfy the exact fixture oracle", async () => {
    const root = mkdtempSync(join(tmpdir(), "ctf-bench-fixture-mismatch-"))
    writeFixture(root, {
      expectedFlag: "flag{fixture_right}",
      producedFlag: "flag{fixture_wrong}",
      replayRequired: false,
      createReplayMarker: false,
    })

    const { code, output } = await runChecker(root)
    expect(code).toBe(1)
    expect(output).toContain("Fixture Results")
    expect(output).toContain("candidate flags present but none equals the expected flag")
  }, 60_000)

  it("fails when replay is required but the replay marker is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "ctf-bench-fixture-replay-"))
    writeFixture(root, {
      expectedFlag: "flag{fixture_replay}",
      producedFlag: "flag{fixture_replay}",
      replayRequired: true,
      createReplayMarker: false,
    })

    const { code, output } = await runChecker(root)
    expect(code).toBe(1)
    expect(output).toContain("oracle verified, but replay marker is missing")
    expect(output).toContain("expected replay marker: result/replay.ok")
  }, 60_000)
})
