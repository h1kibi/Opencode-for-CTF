import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import {
  assertNyuChallengeBoundary,
  loadNyuChallenges,
  materializeNyuAgentWorkspace,
} from "../packages/ctf-benchmark-core/src/nyu.ts"
import { verifyFlag } from "../packages/ctf-benchmark-core/src/oracle.ts"

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nyu-adapter-"))
  const challengeDir = join(root, "2021", "CSAW-Quals", "web", "maze")
  await mkdir(join(challengeDir, "public"), { recursive: true })
  const flag = "flag{nyu_adapter_pass}"
  await writeFile(
    join(root, "development_dataset.json"),
    JSON.stringify({
      "2021q-web-maze": {
        year: "2021",
        event: "CSAW-Quals",
        category: "web",
        challenge: "maze",
        path: "2021/CSAW-Quals/web/maze",
      },
    }),
  )
  await writeFile(
    join(challengeDir, "challenge.json"),
    JSON.stringify({
      name: "maze",
      category: "web",
      description: "Find the flag.",
      flag,
      files: ["public/index.html", "challenge.json"],
      compose: true,
    }),
  )
  await writeFile(join(challengeDir, "public", "index.html"), "hello")
  await writeFile(join(challengeDir, "docker-compose.yaml"), "services: {}\n")
  return { root, challengeDir, flag }
}

describe("NYU CTF Bench adapter", () => {
  it("loads a dataset and keeps the flag in a private hash oracle", async () => {
    const { root, flag } = await fixture()
    const [challenge] = await loadNyuChallenges({
      datasetJson: join(root, "development_dataset.json"),
      split: "development",
    })
    expect(challenge.publicChallenge).toMatchObject({
      id: "2021q-web-maze",
      source: "nyu-ctf-bench",
      split: "development",
      category: "web",
      files: ["public/index.html"],
      hasService: true,
    })
    expect(JSON.stringify(challenge.publicChallenge)).not.toContain(flag)
    expect(challenge.metadataPath).toContain("challenge.json")
    assertNyuChallengeBoundary(challenge)

    const digest = createHash("sha256").update(flag).digest("hex")
    expect(challenge.privateOracle.expectedFlagSha256).toBe(digest)
    expect(verifyFlag(challenge.privateOracle, flag).solved).toBe(true)
  })

  it("accepts a UTF-8 BOM in the dataset JSON", async () => {
    const { root } = await fixture()
    const datasetPath = join(root, "development_dataset.json")
    const dataset = await readFile(datasetPath, "utf8")
    await writeFile(datasetPath, `\uFEFF${dataset}`)

    const [challenge] = await loadNyuChallenges({
      datasetJson: datasetPath,
      split: "development",
    })
    expect(challenge.publicChallenge.id).toBe("2021q-web-maze")
  })
  it("materializes only agent-safe files and writes a sanitized info file", async () => {
    const { root, flag } = await fixture()
    const [challenge] = await loadNyuChallenges({
      datasetJson: join(root, "development_dataset.json"),
      split: "development",
    })
    const target = join(root, "agent-workspace")
    const copied = await materializeNyuAgentWorkspace(challenge, target)
    expect(copied).toEqual(["public/index.html"])
    await expect(readFile(join(target, "challenge.json"))).rejects.toThrow()
    await expect(readFile(join(target, "docker-compose.yaml"))).rejects.toThrow()
    expect(await readFile(join(target, "public", "index.html"), "utf8")).toBe("hello")
    expect(await readFile(join(target, "challenge-info.json"), "utf8")).not.toContain(flag)
  })

  it("rejects challenge paths that escape the dataset root", async () => {
    const root = await mkdtemp(join(tmpdir(), "nyu-adapter-escape-"))
    await writeFile(
      join(root, "development_dataset.json"),
      JSON.stringify({ bad: { year: "2021", event: "CSAW-Quals", category: "web", challenge: "bad", path: "../bad" } }),
    )
    await expect(
      loadNyuChallenges({ datasetJson: join(root, "development_dataset.json"), split: "development" }),
    ).rejects.toThrow(/escapes the challenge directory/)
  })
})
