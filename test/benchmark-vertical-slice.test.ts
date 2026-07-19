import { describe, expect, it } from "vitest"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { verifyFlag } from "../packages/ctf-benchmark-core/src/oracle.ts"

describe("benchmark vertical slice", () => {
  it("verifies a deterministic fixture with an independent oracle", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctf-bench-"))
    const flagFile = path.join(root, "flag.txt")
    await writeFile(flagFile, "flag{vertical_slice}\n")
    const candidate = await readFile(flagFile, "utf8")
    const result = verifyFlag({ id: "misc-deterministic", family: "misc", flagPattern: "^flag\\{vertical_slice\\}$" }, candidate)
    expect(result.solved).toBe(true)
  })
})
