import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("flag candidate tool contracts", () => {
  it("keeps source-map flags separate from secrets and never reports direct solve", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ctf-source-map-candidate-"))
    roots.push(root)
    await writeFile(
      path.join(root, "app.py"),
      ['SECRET_KEY = "not-a-flag-secret"', 'VISIBLE = "flag{source_candidate_payload}"', "return VISIBLE"].join("\n"),
      "utf8",
    )

    const sourceMap = (await import("../tools/web/ctf-web-source-map.ts")).default
    const output = String(await sourceMap.execute({ target: "." }, { directory: root, worktree: root } as never))

    expect(output).toContain("verdict: flag_candidate")
    expect(output).toContain("direct_solve: no")
    expect(output).toContain("candidate_status: pending_oracle")
    expect(output).toContain("flag_candidates:")
    expect(output).toContain("app.py:2:")
    expect(output).toContain("secret_candidates:")
    expect(output).toContain("hardcoded secret/env")
    expect(output).not.toContain("direct_secret_or_flag")
  })

  it("pwn routing never treats a candidate flag as final closure", async () => {
    const router = (await import("../tools/pwn/ctf-pwn-playbook-router.ts")).default
    const candidate = String(
      await router.execute(
        {
          evidence:
            "pwn_runner_summary: script_ran_ok: true flag_detected: true candidate_detected: true oracle_verified: false shell_detected: false",
          jsonOnly: false,
        } as never,
        {} as never,
      ),
    )
    expect(candidate).toContain("closure_priority: candidate_flag_needs_oracle")
    expect(candidate).toContain("oracle_verified: false")
    expect(candidate).not.toContain("closure_priority: final_flag_verified_stop")

    const verified = String(
      await router.execute(
        {
          evidence:
            "pwn_runner_summary: script_ran_ok: true flag_detected: true candidate_detected: true oracle_verified: true flag_verification: oracle-verified outcome_status: oracle-verified",
          jsonOnly: false,
        } as never,
        {} as never,
      ),
    )
    expect(verified).toContain("closure_priority: final_flag_verified_stop")
    expect(verified).toContain("oracle_verified: true")
  })

  it("does not leave direct-flag success semantics in audited runtime tools", async () => {
    const files = [
      "tools/web/ctf-web-blackbox-map.ts",
      "tools/web/ctf-web-source-map.ts",
      "tools/forensics/ctf-pcap-probe.ts",
      "tools/forensics/ctf-pcap-carve.ts",
      "tools/forensics/ctf-stego-probe.ts",
      "tools/forensics/ctf-stego-triage.ts",
      "tools/core/ctf-binary-probe.ts",
      "tools/web/ctf-web-recon-pack.ts",
      "tools/pwn/ctf-pwn-expect-runner.ts",
      "tools/pwn/ctf-pwn-runner.ts",
      "tools/pwn/ctf-pwn-playbook-router.ts",
      "tools/pwn/ctf-pwn-post-shell-runner.ts",
      "tools/pwn/ctf-pwn-remote-fingerprint.ts",
      "tools/android/ctf-apk-triage.ts",
      "tools/rev/ctf-rev-closure-ladder.ts",
    ]
    for (const file of files) {
      const source = await readFile(file, "utf8")
      expect(source, file).not.toMatch(/verdict[^\n]*direct_flag(?!_candidate)/)
      expect(source, file).not.toMatch(/direct_solve:\s*\$\{[^}]*flag/)
      if (
        /ctf-pcap-carve|ctf-stego-triage|ctf-binary-probe|ctf-web-recon-pack|ctf-pwn-runner|ctf-pwn-playbook-router|ctf-apk-triage|ctf-rev-closure-ladder/.test(
          file,
        )
      ) {
        expect(source, file).toContain("oracle_verified")
      }
    }

    const postShell = await readFile("tools/pwn/ctf-pwn-post-shell-runner.ts", "utf8")
    expect(postShell).toContain("oracle_verified: false")
    expect(postShell).toContain("flag_detected_is_candidate_only: true")
    const remote = await readFile("tools/pwn/ctf-pwn-remote-fingerprint.ts", "utf8")
    expect(remote).toContain("flag_candidates: baseline=")
  })
})
