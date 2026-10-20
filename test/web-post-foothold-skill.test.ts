import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

const read = (relative: string) => readFileSync(join(root, relative), "utf8")

describe("web post-foothold skill coverage", () => {
  it("ships the boundary references used by the new Web handoffs", () => {
    const refs = [
      "skills/ctf-web/references/foothold-secrets-minimization.md",
      "skills/ctf-web/references/internal-protocol-validation-matrix.md",
      "skills/ctf-web/references/windows-iis-token-boundary.md",
      "skills/ctf-web/references/container-k8s-cloud-boundary.md",
      "skills/ctf-web/references/post-foothold-evidence-contract.md",
    ]

    for (const ref of refs) expect(existsSync(join(root, ref)), ref).toBe(true)
  })

  it("keeps post-foothold skills on evidence and oracle boundaries", () => {
    const web = read("skills/ctf-web/SKILL.md")
    const cloud = read("skills/ctf-web-cloud/SKILL.md")
    const internal = read("skills/ctf-web-internal-recon/SKILL.md")
    const lateral = read("skills/ctf-web-lateral-movement/SKILL.md")
    const privesc = read("skills/ctf-web-privesc/SKILL.md")
    const postFoothold = read("skills/ctf-web/references/post-foothold-evidence-contract.md")

    expect(web).toContain("ctf-evidence-board command=flag-verify")
    expect(web).toContain("flag-shaped value remains `candidate`")
    expect(cloud).toContain("root UID, mounted socket, or token-looking value is only a candidate")
    expect(internal).toContain("reachable`, `protocol_ok`, `authenticated`, `authorized`, and `closure_relevant")
    expect(lateral).toContain("successful TCP handshake alone")
    expect(privesc).toContain("root UID, or readable file is not elevated execution")
    expect(postFoothold).toContain(
      "origin -> execution_context -> asset -> protocol_ok -> authenticated -> authorized -> impact -> closure",
    )
    expect(postFoothold).toContain("oracle_verified: true")
  })

  it("keeps the reference index synchronized with the new boundary families", () => {
    const index = read("skills/ctf-web/references/REFERENCE_INDEX.md")
    for (const name of [
      "foothold-secrets-minimization.md",
      "internal-protocol-validation-matrix.md",
      "windows-iis-token-boundary.md",
      "container-k8s-cloud-boundary.md",
      "post-foothold-evidence-contract.md",
    ]) {
      expect(index).toContain(name)
    }
    expect(index).toContain("subordinate to the Web orchestrator")
  })
})
