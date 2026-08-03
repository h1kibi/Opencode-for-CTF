import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function runPwnScript(source: string, expectedFlag?: string) {
  const root = await mkdtemp(join(tmpdir(), "ctf-pwn-runner-oracle-"))
  roots.push(root)
  const script = join(root, "solve.py")
  await writeFile(script, source, "utf8")
  const runner = (await import("../tools/pwn/ctf-pwn-runner.ts")).default
  const output = await runner.execute(
    {
      script: "solve.py",
      expectedFlag,
      remoteHost: "127.0.0.1",
      remotePort: "1",
      jsonOnly: true,
    },
    { directory: root, worktree: root } as never,
  )
  return JSON.parse(String(output)).pwn_runner_summary
}

describe("ctf-pwn-runner success semantics", () => {
  it("keeps shell-like and flag-like output as candidate evidence without an oracle", async () => {
    const summary = await runPwnScript('print("uid=1000(pwn) gid=1000(pwn)")\nprint("flag{candidate-only-payload}")\n')

    expect(summary.schema_version).toBe("pwn_runner_summary.v2")
    expect(summary.shell_detected).toBe(true)
    expect(summary.flag_detected).toBe(true)
    expect(summary.flag_detected_is_candidate_only).toBe(true)
    expect(summary.candidate_detected).toBe(true)
    expect(summary.oracle_verified).toBe(false)
    expect(summary.candidate_evidence).toBe(true)
    expect(summary.flag_verification).toBe("candidate")
    expect(summary.root_cause_category).toBe("clean_exit_with_unverified_evidence")
    expect(summary.local_success).toBe(false)
    expect(summary.remote_success).toBe(false)
  })

  it("marks local and remote success only after the exact oracle accepts a candidate", async () => {
    const expectedFlag = "flag{pwn-oracle-verified}"
    const summary = await runPwnScript(`print(${JSON.stringify(expectedFlag)})\n`, expectedFlag)

    expect(summary.flag_verification).toBe("oracle-verified")
    expect(summary.oracle_verified).toBe(true)
    expect(summary.candidate_detected).toBe(true)
    expect(summary.root_cause_category).toBe("oracle_verified_success")
    expect(summary.verified_flag).toBe(expectedFlag)
    expect(summary.local_success).toBe(true)
    expect(summary.remote_success).toBe(true)
  })
})
